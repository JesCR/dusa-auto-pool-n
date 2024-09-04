import { addLiquidity } from './add-liquidity';
import { getClient, PUR , sendTelegramHtml} from './utils';
import { Client, IAccount } from '@massalabs/massa-web3';
import {
  PairV2,
  WMAS as _WMAS,
  USDC as _USDC,
  WETH as _WETH,
  ChainId,
  LiquidityEvent,
} from '@dusalabs/sdk';
import { removeLiquidity } from './remove-liquidity';
import {
  activeBinInPosition,
  getBinsData,
  PAIR_TO_BIN_STEP,
} from './dusa-utils';
import { thankYouThykofToken } from './transfer';
import { getAmountsToAdd, getCurrentPrice } from './equilibrateBalances';
import { profitability } from './profitability';
import { config } from 'dotenv';
import BigNumber from 'bignumber.js';
config();

const originalConsoleLog = console.log;

console.log = function(...args) {
  let sendToTelegram = false;

  if (typeof args[args.length - 1] === 'boolean') {
    sendToTelegram = args.pop();
  }

  const date = new Date();
  const formattedDate = date.toISOString();

  const formattedArgs = args.map(arg => {
    if (typeof arg === 'object') {
      // Agrega una función de reemplazo para manejar BigInt en JSON.stringify
      return JSON.stringify(arg, (key, value) =>
        typeof value === 'bigint' ? value.toString() + 'n' : value  // Agrega 'n' al final para indicar que es un BigInt
      , 2);
    }
    return arg;
  });

  originalConsoleLog(formattedDate, ...formattedArgs);

  if (sendToTelegram && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const message = `<b>${formattedDate}:</b>\n` + formattedArgs.join(' ');
    sendTelegramHtml(message)
      .catch(error => {
        originalConsoleLog('Error sending Telegram message:', error);
      });
  }
};

const CHAIN_ID = ChainId.MAINNET;
const WMAS = _WMAS[CHAIN_ID];
const USDC = _USDC[CHAIN_ID];
const WETH = _WETH[CHAIN_ID];

let oldDepositedEvents: LiquidityEvent[] = [];
let oldPrice: BigNumber | undefined = undefined;

async function provideLiquidity(
  binStep: number,
  client: Client,
  account: IAccount,
  pair: PairV2,
) {
  const currentPrice = await getCurrentPrice(client, pair, binStep);
  const { amountA, amountB } = await getAmountsToAdd(client, account, pair);
  const { depositEvents, compositionFeeEvent } = await addLiquidity(
    binStep,
    client,
    account,
    amountA,
    amountB,
    pair,
    { oldPrice: oldPrice || currentPrice, currentPrice: currentPrice },
  );
  oldDepositedEvents = depositEvents;
  oldPrice = currentPrice;

  return { amountA, amountB, compositionFeeEvent };
}

async function autoLiquidity(
  binStep: number,
  client: Client,
  account: IAccount,
  pair: PairV2,
) {
  const { activeBinId, pairContract, userPositionIds } = await getBinsData(
    binStep,
    client,
    account,
    pair,
  );

  console.log(`\n-------------------START ${process.env.PAIR}-------------------`);
  console.log(`Starting autoLiquidity process`);

  const totalSupplies = await pairContract.getSupplies(userPositionIds);
  const totalUserSupplies = totalSupplies.reduce((acc, curr) => acc + curr, 0n);

  if (totalUserSupplies === 0n) {
    console.log(`no liquidity, let's add some`);
    await provideLiquidity(binStep, client, account, pair);
    return;
  }


  const providingActiveBin = await activeBinInPosition(
    activeBinId,
    userPositionIds,
  );
  if (!providingActiveBin) {
    console.log(`👀  Missed Active bin!!!`);
    const { feesCollectedEvent, withdrawEvents } = await removeLiquidity(
      binStep,
      client,
      account,
      pair,
      activeBinId,
      pairContract,
      userPositionIds,
    );

    const { amountA, amountB, compositionFeeEvent } = await provideLiquidity(
      binStep,
      client,
      account,
      pair,
    );

    await thankYouThykofToken(client, pair.tokenA, amountA.raw / 100_000n);
    await thankYouThykofToken(client, pair.tokenB, amountB.raw / 100_000n);

    try {
      await profitability(
        client,
        pair,
        withdrawEvents,
        oldDepositedEvents,
        compositionFeeEvent,
        feesCollectedEvent,
      );
    } catch (error) {
      console.error('Error aggregating fees', error);
    }
  } else {
    console.log(`✅  Active bin in position!`);
  }
}

async function main() {
  const { client, account } = await getClient(process.env.WALLET_SECRET_KEY!);

  const interval = process.env.INTERVAL ? parseInt(process.env.INTERVAL) : 5;
  const intervalMs = 1000 * 60 * interval;

  let pair: PairV2;
  let binStep: number;

  console.log(`Pair: ${process.env.PAIR}`);
  if (process.env.PAIR === 'WETH-WMAS') {
    pair = new PairV2(WETH, WMAS);
    binStep = PAIR_TO_BIN_STEP['WETH-WMAS'];
  } else if (process.env.PAIR === 'WMAS-USDC') {
    pair = new PairV2(WMAS, USDC);
    binStep = PAIR_TO_BIN_STEP['WMAS-USDC'];
  } else if (process.env.PAIR === 'PUR-WMAS') {
    pair = new PairV2(PUR, WMAS);
    binStep = PAIR_TO_BIN_STEP['PUR-WMAS'];
  } else {
    throw new Error('Invalid pair');
  }

  await autoLiquidity(binStep, client, account, pair);
  setInterval(async () => {
    await autoLiquidity(binStep, client, account, pair);
  }, intervalMs);
}

await main();
