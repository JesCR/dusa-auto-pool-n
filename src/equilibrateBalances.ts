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

  const currentPriceUSD = await getCurrentPriceUSD(client);

  const balanceTokenAReal = new BigNumber(balanceTokenA).dividedBy(10 ** tokenA.decimals).toFixed(5);
  const balanceTokenBReal = new BigNumber(balanceTokenB).dividedBy(10 ** tokenB.decimals).toFixed(5);
  console.log(`👀  ${process.env.PAIR}: WMAS Current Price: ${currentPriceUSD}`, true);
  console.log(`👀  ${process.env.PAIR}: WETH Current Price: ${currentPrice}`, true);
  console.log(`👀  ${process.env.PAIR}: Balance TokenA: ${balanceTokenAReal} ${tokenA.symbol}`, true)
  console.log(`👀  ${process.env.PAIR}: Balance TokenB: ${balanceTokenBReal} ${tokenB.symbol}`, true)

  const balanceTokenAInUSD = BigInt(
    new BigNumber(balanceTokenA.toString())
        .multipliedBy(currentPrice)
        .multipliedBy(currentPriceUSD)
        .toFixed(0),
    );

  const balanceTokenBInUSD = BigInt(
    new BigNumber(balanceTokenB.toString())
        .multipliedBy(currentPriceUSD)
        .toFixed(0),
    );    

  const balanceTokenAInUSDCReal = new BigNumber(balanceTokenAInUSD).dividedBy(10 ** 6).toFixed(5);
  const balanceTokenBInUSDCReal = new BigNumber(balanceTokenBInUSD).dividedBy(10 ** 6).toFixed(5);
  console.log(`👀  ${process.env.PAIR}: Balance TokenB In USD: ${balanceTokenBInUSDCReal}`, true);
  console.log(`👀  ${process.env.PAIR}: Balance TokenA In USD: ${balanceTokenAInUSDCReal}`, true);


  const totalValueInUSDC = balanceTokenAInUSD + balanceTokenBInUSD;
  const halfValueInUSDC = totalValueInUSDC / 2n;
  const totalValueInUSDCReal = new BigNumber(totalValueInUSDC).dividedBy(10 ** 6).toFixed(5);
  const halfValueInUSDCReal = new BigNumber(halfValueInUSDC).dividedBy(10 ** 6).toFixed(5);

  console.log(`👀  ${process.env.PAIR}: Total value In USD: ${totalValueInUSDCReal}`, true);
  console.log(`👀  ${process.env.PAIR}: Half value In USD: ${halfValueInUSDCReal}`, true);

  const higherBalanceToken = balanceTokenAInUSD > balanceTokenBInUSD ? tokenA : tokenB;
  console.log(`👀  ${process.env.PAIR}: Higher Balance Token: ${higherBalanceToken.symbol}`, true);
  const excessValueInUSD = higherBalanceToken === tokenA 
      ? balanceTokenAInUSD - halfValueInUSDC
      : balanceTokenBInUSD - halfValueInUSDC;

  const excessValueInUSDReal = new BigNumber(excessValueInUSD).dividedBy(10 ** 6).toFixed(5);
  console.log(`👀  ${process.env.PAIR}: Distance from halfvalue in USD: ${excessValueInUSDReal}`, true);

  const bigNumberExcessValueInUSD = new BigNumber(excessValueInUSD.toString());
  let tmpResult = new BigNumber(0);
  if (balanceTokenAInUSD > balanceTokenBInUSD){
    tmpResult = bigNumberExcessValueInUSD.dividedBy(currentPrice);
  } else {
    tmpResult = bigNumberExcessValueInUSD.dividedBy(currentPriceUSD);
  }
  const result = tmpResult //bigNumberExcessValueInUSD.dividedBy(currentPrice);
  const roundedResult = result.decimalPlaces(0, BigNumber.ROUND_HALF_UP);
  const finalBigIntResult = BigInt(roundedResult.toString());
  const finalBigIntResultReal = new BigNumber(finalBigIntResult).dividedBy(10 ** tokenA.decimals).toFixed(5);

  console.log(`👀  ${process.env.PAIR}: bigNumberExcessValueInUSD: ${bigNumberExcessValueInUSD}`, true)
  console.log(`👀  ${process.env.PAIR}: result: ${result}`, true)
  console.log(`👀  ${process.env.PAIR}: roundedResult: ${roundedResult}`, true)
  console.log(`👀  ${process.env.PAIR}: finalBigIntResult: ${finalBigIntResult}`, true)
  console.log(`👀  ${process.env.PAIR}: finalBigIntResultReal: ${finalBigIntResultReal}`, true)

  //console.log(`Excess value in Token A: ${finalBigIntResult}`);
  console.log(`👀  ${process.env.PAIR}: Distance from halfvalue in Token A: ${finalBigIntResultReal} ${tokenA.symbol}`, true);
  
  const amountToSwap = higherBalanceToken === tokenA
      ? new TokenAmount(tokenA, finalBigIntResult)
      : new TokenAmount(tokenB, excessValueInUSD);

  console.log(`👀  ${process.env.PAIR}: Amount to swap: ${amountToSwap.raw} (${higherBalanceToken.symbol})`, true);

  
  //let balanceTokenBReal_1 = new BigNumber(balanceTokenBReal);  // balance en USDC, por ejemplo
  //let balanceTokenAInTokenBReal_2 = new BigNumber(balanceTokenAInTokenBReal);  // valor equivalente del otro token en USDC
  let difference = Math.abs(balanceTokenAInUSDCReal - balanceTokenBInUSDCReal);
  console.log(`👀  ${process.env.PAIR}: difference: ${difference}`, true)
  let total = balanceTokenAInUSDCReal * balanceTokenBInUSDCReal;
  console.log(`👀  ${process.env.PAIR}: total: ${total}`, true)
  let percentageDifference = (difference/total) * 100;
  console.log(`👀  ${process.env.PAIR}: percentageDifference: ${percentageDifference}`, true)


  await new Promise(resolve => setTimeout(resolve, 100000));



  if (percentageDifference > 5) {
    console.log('ℹ️ ${process.env.PAIR}: Difference  > 5%, swapping!', true);
  } else {
      //console.log('La diferencia no es superior al 5%.');
      console.log('ℹ️ ${process.env.PAIR}: Difference < 5%, not swapping!', true);
      return false;
  }
  // Don't swap if the difference is low
  /* if (new BigNumber(amountToSwap.raw).lt(totalValueInTokenB.multipliedBy(10 ** tokenB.decimals).multipliedBy(0.07).toFixed(0))) {
      console.log('ℹ️ Low difference, not swapping', true);
      return;
    } */

  const lowerBalanceToken = higherBalanceToken === tokenA ? tokenB : tokenA;
  await swap(client, account, higherBalanceToken, lowerBalanceToken, amountToSwap);

  return true;
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

export async function getCurrentPriceUSD(
  client: Client,
) {
  const pair = new PairV2(WMAS, USDC);
  const binStep = PAIR_TO_BIN_STEP['WMAS-USDC'];
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
