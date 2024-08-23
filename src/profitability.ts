import {
  ChainId,
  CollectFeesEvent,
  CompositionFeeEvent,
  ILBPair,
  WMAS as _WMAS,
  WETH as _WETH,
  USDC as _USDC,
  PairV2,
  TokenAmount,
  Token,
  LiquidityEvent,
} from '@dusalabs/sdk';
import fs from 'fs';
import { getClient } from './utils';
import { getBinsData, PAIR_TO_BIN_STEP } from './dusa-utils';
import { Client, IAccount } from '@massalabs/massa-web3';
import { findBestTrade } from './swap';
import * as path from 'path';
import { config } from 'dotenv';
config();

const CHAIN_ID = ChainId.MAINNET;
const WMAS = _WMAS[CHAIN_ID];
const WETH = _WETH[CHAIN_ID];
const USDC = _USDC[CHAIN_ID];

const logFile =
  new Date().getTime() + (process.env.PAIR || '') + '_p-and-l.log';
const logFileProfitAndLoss = `${new Date().getTime()}${
  process.env.PAIR
}_p-and-l-acc.log`;
const logFileIL = `${new Date().getTime()}${process.env.PAIR}_il.log`;
const logFileILAcc = `${new Date().getTime()}${process.env.PAIR}_il_acc.log`;
const logFileTotal = `${new Date().getTime()}${process.env.PAIR}_total.log`;
const logFileTotalAcc = `${new Date().getTime()}${
  process.env.PAIR
}_total_acc.log`;

function pushInFile(fileName: string, value: string, label?: string) {
  console.log(`ℹ️ ${label || ''} ${value}`, true);
  fs.appendFileSync(path.join('src', fileName), value + '\n');
}

let profitAndLoss = 0n;
let totalIL = 0n;
let totalGlobal = 0n;

export async function profitability(
  client: Client,
  pair: PairV2,
  withdrawEvents: LiquidityEvent[],
  depositedEvents: LiquidityEvent[],
  compositionFees?: CompositionFeeEvent,
  collectedFees?: CollectFeesEvent,
) {
  // #1 composition fees and collected fees
  // we want to trade X to Y
  const tokenAisX = !pair.tokenA.equals(WMAS);
  const inputToken = tokenAisX ? pair.tokenA : pair.tokenB;
  const outputToken = tokenAisX ? pair.tokenB : pair.tokenA;
  const tokenX = tokenAisX ? pair.tokenA : pair.tokenB; // WETH or USDC
  const tokenY = tokenAisX ? pair.tokenB : pair.tokenA; // WMAS
  const { rewardsX, rewardsY } = totalRewards(
    tokenX,
    tokenY,
    collectedFees,
    compositionFees,
  );
  console.log(
    'ℹ️ Rewards X',
    `${new TokenAmount(tokenX, rewardsX).toSignificant(tokenX.decimals)} ${
      tokenX.symbol
    }`,
  );
  console.log(
    'ℹ️ Rewards Y',
    `${new TokenAmount(tokenY, rewardsY).toSignificant(tokenY.decimals)} ${
      tokenY.symbol
    }`,
  );
  let removedAmountIn = new TokenAmount(tokenX, rewardsX);

  let feesGains = rewardsY;
  let neg = false;
  if (removedAmountIn.raw !== 0n) {
    neg = removedAmountIn.raw < 0n;
    if (neg) {
      console.log('amountIn is negative');
      removedAmountIn = new TokenAmount(tokenX, removedAmountIn.raw * -1n);
    }
    const { bestTrade } = await findBestTrade(
      client,
      inputToken,
      outputToken,
      removedAmountIn,
      true,
    );
    feesGains += neg
      ? bestTrade.outputAmount.raw * -1n
      : bestTrade.outputAmount.raw;
  }
  const feesGainsAmount = new TokenAmount(tokenY, feesGains);
  profitAndLoss += feesGains;
  pushInFile(
    logFile,
    `${feesGainsAmount.toSignificant(tokenY.decimals)} ${tokenY.symbol}`,
    'feesGainsAmount',
  );
  pushInFile(
    logFileProfitAndLoss,
    `${new TokenAmount(tokenY, profitAndLoss).toSignificant(tokenY.decimals)} ${
      tokenY.symbol
    }`,
    'profitAndLoss',
  );

  // #2 impermanent loss
  let impermanentLoss = 0n;
  if (depositedEvents) {
    // get the removed liquidity and convert into Y
    const withdrawAmountX = withdrawEvents.reduce(
      (acc, curr) => acc + curr.amountX,
      0n,
    );
    const withdrawAmountY = withdrawEvents.reduce(
      (acc, curr) => acc + curr.amountY,
      0n,
    );
    console.log(
      'ℹ️ WithdrawAmountX',
      `${new TokenAmount(tokenX, withdrawAmountX).toSignificant(
        tokenX.decimals,
      )} ${tokenX.symbol}`, true
    );
    console.log(
      'ℹ️ WithdrawAmountY',
      `${new TokenAmount(tokenY, withdrawAmountY).toSignificant(
        tokenY.decimals,
      )} ${tokenY.symbol}`, true
    );

    let removedAmountY = 0n;
    if (withdrawAmountX > 0n) {
      const { bestTrade } = await findBestTrade(
        client,
        inputToken,
        outputToken,
        new TokenAmount(tokenX, withdrawAmountX),
        true,
      );
      removedAmountY = bestTrade.outputAmount.raw;
    }
    const totalRemoved = removedAmountY + withdrawAmountY;
    console.log(
      'ℹ️ TotalRemoved',
      `${new TokenAmount(tokenY, totalRemoved).toSignificant(
        tokenY.decimals,
      )} ${tokenY.symbol}`, true
    );

    // get the added liquidity and convert into Y
    if (depositedEvents.length === 0) {
      console.log('no data of added liquidity');
      return;
    }
    const addedAmountX = depositedEvents.reduce(
      (acc, curr) => acc + curr.amountX,
      0n,
    );
    const addedAmountY = depositedEvents.reduce(
      (acc, curr) => acc + curr.amountY,
      0n,
    );
    console.log(
      'ℹ️ AddedAmountX',
      `${new TokenAmount(tokenX, addedAmountX).toSignificant(
        tokenX.decimals,
      )} ${tokenX.symbol}`, true
    );
    console.log(
      'ℹ️ AddedAmountY',
      `${new TokenAmount(tokenY, addedAmountY).toSignificant(
        tokenY.decimals,
      )} ${tokenY.symbol}`, true
    );

    let addedY = 0n;
    if (addedAmountX > 0n) {
      const { bestTrade } = await findBestTrade(
        client,
        inputToken,
        outputToken,
        new TokenAmount(tokenX, addedAmountX),
        true,
      );
      addedY = bestTrade.outputAmount.raw;
    }
    const totalAdded = addedY + addedAmountY;
    console.log(
      'ℹ️ TotalAdded',
      `${new TokenAmount(tokenY, totalAdded).toSignificant(tokenY.decimals)} ${
        tokenY.symbol
      }`, true
    );

    // log impermanent loss
    impermanentLoss = totalAdded - totalRemoved;
    totalIL += impermanentLoss;
    pushInFile(
      logFileIL,
      `${new TokenAmount(tokenY, impermanentLoss).toSignificant(
        tokenY.decimals,
      )} ${tokenY.symbol}`,
      'ImpermanentLoss',
    );
    pushInFile(
      logFileILAcc,
      `${new TokenAmount(tokenY, totalIL).toSignificant(tokenY.decimals)} ${
        tokenY.symbol
      }`,
      'TotalIL',
    );
  }

  // #3 total
  const total = feesGains - impermanentLoss;
  pushInFile(
    logFileTotal,
    `${new TokenAmount(tokenY, total).toSignificant(tokenY.decimals)} ${
      tokenY.symbol
    }`,
    'Total',
  );

  totalGlobal += total;
  pushInFile(
    logFileTotalAcc,
    `${new TokenAmount(tokenY, totalGlobal).toSignificant(tokenY.decimals)} ${
      tokenY.symbol
    }`,
    'TotalGlobal',
  );
}

function totalRewards(
  tokenX: Token,
  tokenY: Token,
  collectedFees?: CollectFeesEvent,
  compositionFees?: CompositionFeeEvent,
) {
  if (compositionFees) {
    console.log(
      'ℹ️ Composition fees X',
      `${new TokenAmount(tokenX, compositionFees.activeFeeX).toSignificant(
        tokenX.decimals,
      )} ${tokenX.symbol}`, true
    );
    console.log(
      'ℹ️ Composition fees Y',
      `${new TokenAmount(tokenY, compositionFees.activeFeeY).toSignificant(
        tokenY.decimals,
      )} ${tokenY.symbol}`, true
    );
  }

  if (collectedFees) {
    console.log(
      'ℹ️ Collected fees X',
      `${new TokenAmount(tokenX, collectedFees.amountX).toSignificant(
        tokenX.decimals,
      )} ${tokenX.symbol}`, true
    );
    console.log(
      'ℹ️ Collected fees Y',
      `${new TokenAmount(tokenY, collectedFees.amountY).toSignificant(
        tokenY.decimals,
      )} ${tokenY.symbol}`, true
    );
  }

  const rewardsX =
    (collectedFees?.amountX || 0n) - (compositionFees?.activeFeeX || 0n);
  const rewardsY =
    (collectedFees?.amountY || 0n) - (compositionFees?.activeFeeY || 0n);
  return { rewardsX, rewardsY };
}

async function main() {
  const { client, account } = await getClient(process.env.WALLET_SECRET_KEY!);
  const pair = new PairV2(WETH, WMAS);
  console.log(!pair.tokenA.equals(WMAS));

  console.log('===test nothing to trade');
  await profitability(
    client,
    pair,
    [],
    [],
    {
      to: account.address!,
      id: 0,
      activeFeeX: 0n, // WETH
      activeFeeY: 1658950354n, // WMAS
    },
    {
      caller: account.address!, // idk
      to: account.address!,
      amountX: 0n,
      amountY: 2043598431n,
    },
  );
  console.log('===test no reward, loss');
  await profitability(
    client,
    pair,
    [],
    [],
    {
      to: account.address!,
      id: 0,
      activeFeeX: 210653417347550n, // WETH
      activeFeeY: 0n, // WMAS
    },
    {
      caller: account.address!, // idk
      to: account.address!,
      amountX: 6071260057724n,
      amountY: 1475693250n,
    },
  );
}

// await main();
