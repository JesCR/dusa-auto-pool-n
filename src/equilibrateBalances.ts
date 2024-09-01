import { Client } from '@massalabs/massa-web3';
import {
  Bin,
  ChainId,
  ILBPair,
  PairV2,
  TokenAmount,
  USDC as _USDC,
  WETH as _WETH,
  WMAS as _WMAS,
} from '@dusalabs/sdk';
import { IAccount } from '@massalabs/massa-web3';
import { getBalance } from './balance';
import BigNumber from 'bignumber.js';
import { swap } from './swap';
import { getClient } from './utils';
import { PAIR_TO_BIN_STEP } from './dusa-utils';
import { config } from 'dotenv';
config();

const CHAIN_ID = ChainId.MAINNET;

const WMAS = _WMAS[CHAIN_ID];
const USDC = _USDC[CHAIN_ID];
const WETH = _WETH[CHAIN_ID];

const maxTokenA = process.env.TOKEN_A_MAX
  ? BigInt(process.env.TOKEN_A_MAX)
  : Infinity;
const maxTokenB = process.env.TOKEN_B_MAX
  ? BigInt(process.env.TOKEN_B_MAX)
  : Infinity;

export async function getAmountsToAdd(
  client: Client,
  account: IAccount,
  pair: PairV2,
) {
  const tokenA = pair.tokenA;
  const tokenB = pair.tokenB;

  const newBalanceTokenA = await getBalance(
    tokenA.address,
    client,
    account.address!,
  );
  const newBalanceTokenB = await getBalance(
    tokenB.address,
    client,
    account.address!,
  );

  let amountA = newBalanceTokenA - (newBalanceTokenA / 100n) * 1n;
  if (typeof maxTokenA === 'bigint' && maxTokenA < amountA) {
    amountA = maxTokenA;
  }
  let amountB = newBalanceTokenB - (newBalanceTokenB / 100n) * 1n;
  if (typeof maxTokenB === 'bigint' && maxTokenB < amountB) {
    amountB = maxTokenB;
  }

  return {
    amountA: new TokenAmount(tokenA, amountA),
    amountB: new TokenAmount(tokenB, amountB),
  };
}
/* 
export async function equilibrateBalances(
  client: Client,
  account: IAccount,
  pair: PairV2,
  currentPrice: BigNumber,
) {
  const tokenA = pair.tokenA;
  const tokenB = pair.tokenB;

  const { amountA, amountB } = await getAmountsToAdd(client, account, pair);
  const balanceTokenA = amountA.raw;
  const balanceTokenB = amountB.raw;

  const balanceAWorthInB = BigInt(
    new BigNumber(balanceTokenA.toString())
      .multipliedBy(currentPrice)
      .toFixed(0),
  );
  const totalValue = balanceTokenB + balanceAWorthInB;
  const halfValue = totalValue / 2n;

  const higherBalanceToken = balanceAWorthInB > balanceTokenB ? tokenA : tokenB;
  const higherBalanceAmount =
    higherBalanceToken === tokenA ? balanceAWorthInB : balanceTokenB;
  const amountToSwap = new TokenAmount(
    higherBalanceToken,
    higherBalanceAmount - halfValue,
  );

  // don't swap if the difference is low
  if (amountToSwap.raw < (totalValue * 7n) / 100n) {
    console.log('ℹ️ Low difference, not swapping', true);
    return;
  }

  const lowerBalanceToken = higherBalanceToken === tokenA ? tokenB : tokenA;
  const inputToken = higherBalanceToken;
  const outputToken = lowerBalanceToken;

  await swap(client, account, inputToken, outputToken, amountToSwap);
}
 */

export async function equilibrateBalances(client: Client, account: IAccount, pair: PairV2, currentPrice: BigNumber) {
  const tokenA = pair.tokenA;
  const tokenB = pair.tokenB;

  const { amountA, amountB } = await getAmountsToAdd(client, account, pair);
  const balanceTokenA = amountA.raw;
  const balanceTokenB = amountB.raw;


  const balanceTokenAReal = new BigNumber(balanceTokenA).dividedBy(10 ** tokenA.decimals).toFixed(5);
  const balanceTokenBReal = new BigNumber(balanceTokenB).dividedBy(10 ** tokenB.decimals).toFixed(5);
  console.log(`WMAS Current Price: ${currentPrice}`, true);
  //console.log(`balanceTokenA: ${balanceTokenA} (${tokenA.decimals} decimals)`)
  //console.log(`balanceTokenB: ${balanceTokenB} (${tokenB.decimals} decimals)`)
  console.log(`Balance TokenA: ${balanceTokenAReal} ${tokenA.symbol}`, true)
  console.log(`Balance TokenB: ${balanceTokenBReal} ${tokenB.symbol}`, true)

  /* const balanceTokenAInTokenB = new BigNumber(balanceTokenA.toString())
      .multipliedBy(currentPrice)
      .toFixed(0) */
  const balanceTokenAInUSD = BigInt(
    new BigNumber(balanceTokenA.toString())
        .multipliedBy(currentPrice)
        .toFixed(0),
    );

  const balanceTokenBInUSD = BigInt(
    new BigNumber(balanceTokenB.toString())
        .multipliedBy(currentPrice)
        .toFixed(0),
    );    

  const balanceTokenAInUSDCReal = new BigNumber(balanceTokenAInUSD).dividedBy(10 ** 6).toFixed(5);
  const balanceTokenBInUSDCReal = new BigNumber(balanceTokenBInUSD).dividedBy(10 ** 6).toFixed(5);
  console.log(`Balance TokenB In USD: ${balanceTokenBInUSDCReal}`, true);
  console.log(`Balance TokenA In USD: ${balanceTokenAInUSDCReal}`, true);


  const totalValueInUSDC = balanceTokenAInUSD + balanceTokenBInUSD;
  const halfValueInUSDC = totalValueInUSDC / 2n;
  const totalValueInUSDCReal = new BigNumber(totalValueInUSDC).dividedBy(10 ** 6).toFixed(5);
  const halfValueInUSDCReal = new BigNumber(halfValueInUSDC).dividedBy(10 ** 6).toFixed(5);

  console.log(`Total value: ${totalValueInUSDCReal} ${tokenB.symbol}`, true);
  console.log(`Half value: ${halfValueInUSDCReal} ${tokenB.symbol}`, true);

  const higherBalanceToken = balanceTokenAInUSD > balanceTokenBInUSD ? tokenA : tokenB;
  console.log(`Higher Balance Token: ${higherBalanceToken.symbol}`, true);
  const excessValueInUSD = higherBalanceToken === tokenA 
      ? balanceTokenAInUSD - halfValueInUSDC
      : balanceTokenBInUSD - halfValueInUSDC;

  const excessValueInUSDReal = new BigNumber(excessValueInUSD).dividedBy(10 ** 6).toFixed(5);
  console.log(`Distance from halfvalue in Token B: ${excessValueInUSDReal} ${tokenB.symbol}`, true);

  const bigNumberExcessValueInUSD = new BigNumber(excessValueInUSD.toString());
  const result = bigNumberExcessValueInUSD.dividedBy(currentPrice);
  const roundedResult = result.decimalPlaces(0, BigNumber.ROUND_HALF_UP);
  const finalBigIntResult = BigInt(roundedResult.toString());
  const finalBigIntResultReal = new BigNumber(finalBigIntResult).dividedBy(10 ** tokenA.decimals).toFixed(5);

  console.log('bigNumberExcessValueInUSD: ',bigNumberExcessValueInUSD)
  console.log('result: ',result)
  console.log('roundedResult: ',roundedResult)
  console.log('finalBigIntResult: ',finalBigIntResult)
  console.log('finalBigIntResultReal: ',finalBigIntResultReal)

  //console.log(`Excess value in Token A: ${finalBigIntResult}`);
  console.log(`Distance from halfvalue in Token A: ${finalBigIntResultReal} ${tokenA.symbol}`, true);
  
  const amountToSwap = higherBalanceToken === tokenA
      ? new TokenAmount(tokenA, finalBigIntResult)
      : new TokenAmount(tokenB, excessValueInUSD);

  console.log(`Amount to swap: ${amountToSwap.raw} (${higherBalanceToken.symbol})`, true);

  
  let balanceTokenBReal_1 = new BigNumber(balanceTokenBReal);  // balance en USDC, por ejemplo
  let balanceTokenAInTokenBReal_2 = new BigNumber(balanceTokenAInTokenBReal);  // valor equivalente del otro token en USDC
  let difference = balanceTokenBReal_1.minus(balanceTokenAInTokenBReal_2).abs();
  console.log('difference: ', difference)
  let total = balanceTokenBReal_1.plus(balanceTokenAInTokenBReal_2);
  console.log('total: ', total)
  let percentageDifference = difference.dividedBy(total).multipliedBy(100);
  console.log('percentageDifference: ', percentageDifference)

  if (percentageDifference > 5) {
    console.log('ℹ️ Difference  > 5%, swapping!', true);
  } else {
      //console.log('La diferencia no es superior al 5%.');
      console.log('ℹ️ Difference < 5%, not swapping!', true);
      return false;
  }
  // Don't swap if the difference is low
  /* if (new BigNumber(amountToSwap.raw).lt(totalValueInTokenB.multipliedBy(10 ** tokenB.decimals).multipliedBy(0.07).toFixed(0))) {
      console.log('ℹ️ Low difference, not swapping', true);
      return;
    } */

  const lowerBalanceToken = higherBalanceToken === tokenA ? tokenB : tokenA;
  await swap(client, account, higherBalanceToken, lowerBalanceToken, amountToSwap);
}


export async function getCurrentPrice(
  client: Client,
  pair: PairV2,
  binStep: number,
) {
  const lbPair = await pair.fetchLBPair(binStep, client, CHAIN_ID);

  const lbPairData = await new ILBPair(
    lbPair.LBPair,
    client,
  ).getReservesAndId();

  return new BigNumber(Bin.getPriceFromId(lbPairData.activeId, binStep));
}

async function main() {
  const { client, account } = await getClient(process.env.WALLET_SECRET_KEY!);

  // const pair = new PairV2(WMAS, USDC);
  // const binStep = PAIR_TO_BIN_STEP['WMAS-USDC'];

  const pair = new PairV2(WETH, WMAS);
  const binStep = PAIR_TO_BIN_STEP['WETH-WMAS'];

  const currentPrice = await getCurrentPrice(client, pair, binStep);
  console.log(currentPrice);

  equilibrateBalances(client, account, pair, currentPrice);
}

// await main();
