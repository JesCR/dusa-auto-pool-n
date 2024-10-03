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

export async function equilibrateBalances(client: Client, account: IAccount, pair: PairV2, currentPrice: BigNumber) {
  const tokenA = pair.tokenA;
  const tokenB = pair.tokenB;

  const { amountA, amountB } = await getAmountsToAdd(client, account, pair);
  const balanceTokenA = amountA.raw;
  const balanceTokenB = amountB.raw;

  const maxTokenAReal = new BigNumber(maxTokenA).dividedBy(10 ** tokenA.decimals).toFixed(5);
  const maxTokenBReal = new BigNumber(maxTokenB).dividedBy(10 ** tokenB.decimals).toFixed(5);

  const currentPriceUSD = await getCurrentPriceUSD(client);

  const currentPriceWMASinUSDCReal = currentPriceUSD * 10 ** 3
  const currentPriceWETHinUSDCReal = currentPriceUSD * currentPrice * 10 ** 12;
  const currentPriceWETHinWMASReal = currentPrice * 10 ** 9;

  const balanceTokenAReal = new BigNumber(balanceTokenA).dividedBy(10 ** tokenA.decimals).toFixed(5);
  const balanceTokenBReal = new BigNumber(balanceTokenB).dividedBy(10 ** tokenB.decimals).toFixed(5);
  console.log(`👀  ${process.env.PAIR}: WMAS Current Price in USDC: ${currentPriceUSD}`);
  console.log(`👀  ${process.env.PAIR}: WETH Current Price in WMAS: ${currentPrice}`);
  console.log(`👀  ${process.env.PAIR}: WETH Current Price in WMAS Real: ${currentPriceWETHinWMASReal}`);
  console.log(`👀  ${process.env.PAIR}: WMAS Current Price in USDC Real: ${currentPriceWMASinUSDCReal}`);
  console.log(`👀  ${process.env.PAIR}: WETH Current Price in USDC Real: ${currentPriceWETHinUSDCReal}`);
  console.log(`👀  ${process.env.PAIR}: Balance TokenA: ${balanceTokenA} -> ${balanceTokenAReal} ${tokenA.symbol}`)
  console.log(`ℹ️ ${process.env.PAIR}: maxTokenA ${maxTokenA} -> ${maxTokenAReal}`);
  console.log(`👀  ${process.env.PAIR}: Balance TokenB: ${balanceTokenB} -> ${balanceTokenBReal} ${tokenB.symbol}`)
  console.log(`ℹ️ ${process.env.PAIR}: maxTokenB ${maxTokenB} -> ${maxTokenBReal}`);

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
  console.log(`👀  ${process.env.PAIR}: Balance TokenA (${tokenA.symbol}) In USD: ${balanceTokenAInUSDCReal}`, true);
  console.log(`👀  ${process.env.PAIR}: Balance TokenB (${tokenB.symbol}) In USD: ${balanceTokenBInUSDCReal}`, true);
  

  const totalValueInUSDC = balanceTokenAInUSD + balanceTokenBInUSD;
  const halfValueInUSDC = totalValueInUSDC / 2n;
  const totalValueInUSDCReal = new BigNumber(totalValueInUSDC).dividedBy(10 ** 6).toFixed(5);
  const halfValueInUSDCReal = new BigNumber(halfValueInUSDC).dividedBy(10 ** 6).toFixed(5);

  console.log(`💰  ${process.env.PAIR}: Total value In USD: ${totalValueInUSDCReal}`,true);
  console.log(`👀  ${process.env.PAIR}: Half value In USD: ${halfValueInUSDCReal}`);

  const higherBalanceToken = balanceTokenAInUSD > balanceTokenBInUSD ? tokenA : tokenB;
  console.log(`👀  ${process.env.PAIR}: Higher Balance Token: ${higherBalanceToken.symbol}`);
  const excessValueInUSD = higherBalanceToken === tokenA 
      ? balanceTokenAInUSD - halfValueInUSDC
      : balanceTokenBInUSD - halfValueInUSDC;

  const excessValueInUSDReal = new BigNumber(excessValueInUSD).dividedBy(10 ** 6).toFixed(5);
  console.log(`👀  ${process.env.PAIR}: Distance from halfvalue in USD: ${excessValueInUSDReal}`);


  


  const bigNumberExcessValueInUSD = new BigNumber(excessValueInUSD.toString());
  let tmpResult = new BigNumber(0);
  if (balanceTokenAInUSD > balanceTokenBInUSD){
    //tengo que cambiar el exceso en dolares de weth a wmas
    //cuantos WETH son el exceso en USD?
    const amountWETHtoSwapReal = excessValueInUSDReal / currentPriceWETHinUSDCReal;
    const amountWETHtoSwap = new BigNumber(amountWETHtoSwapReal * 10 ** tokenA.decimals);
    console.log(`${excessValueInUSDReal} $ in WETH: ${amountWETHtoSwapReal}`);
    console.log(`{amountWETHtoSwap}: ${amountWETHtoSwapReal} * 10 ** ${tokenA.decimals} = ${amountWETHtoSwap}`);

    tmpResult = amountWETHtoSwap;
  } else {
    //tengo que cambiar el exceso en dolares de wmas a weth
    //cuantos WMAS son el exceso en USD?
    const amountWMAStoSwapReal = excessValueInUSDReal / currentPriceWMASinUSDCReal;
    const amountWMAStoSwap =  new BigNumber(amountWMAStoSwapReal * 10 ** tokenB.decimals);
    console.log(`${excessValueInUSDReal} $ in WMAS: ${amountWMAStoSwapReal}`);
    console.log(`{amountWMAStoSwap}: ${amountWMAStoSwapReal} * 10 ** ${tokenB.decimals} = ${amountWMAStoSwap}`);

    tmpResult = amountWMAStoSwap;
  }
  const result = tmpResult //bigNumberExcessValueInUSD.dividedBy(currentPrice);
  const roundedResult = result.decimalPlaces(0, BigNumber.ROUND_HALF_UP);
  const finalBigIntResult = BigInt(roundedResult.toString());
  //const finalBigIntResultReal = new BigNumber(finalBigIntResult).dividedBy(10 ** tokenA.decimals).toFixed(5);

  console.log(`👀  ${process.env.PAIR}: bigNumberExcessValueInUSD: ${bigNumberExcessValueInUSD}`)
  //console.log(`👀  ${process.env.PAIR}: result: ${result}`, true)
  //console.log(`👀  ${process.env.PAIR}: roundedResult: ${roundedResult}`, true)
  //console.log(`👀  ${process.env.PAIR}: finalBigIntResult: ${finalBigIntResult}`, true)
  //console.log(`👀  ${process.env.PAIR}: finalBigIntResultReal: ${finalBigIntResultReal}`, true)

  //console.log(`Excess value in Token A: ${finalBigIntResult}`);
  //console.log(`👀  ${process.env.PAIR}: Distance from halfvalue in Token: ${finalBigIntResult} ${higherBalanceToken.symbol}`, true);
  
  const amountToSwap = higherBalanceToken === tokenA
      ? new TokenAmount(tokenA, finalBigIntResult)
      : new TokenAmount(tokenB, finalBigIntResult);

  console.log(`👀  ${process.env.PAIR}: Amount to swap: ${amountToSwap.raw} (${higherBalanceToken.symbol})`);

  
  //let balanceTokenBReal_1 = new BigNumber(balanceTokenBReal);  // balance en USDC, por ejemplo
  //let balanceTokenAInTokenBReal_2 = new BigNumber(balanceTokenAInTokenBReal);  // valor equivalente del otro token en USDC
  let difference = Math.abs(balanceTokenAInUSDCReal - balanceTokenBInUSDCReal);
  console.log(`👀  ${process.env.PAIR}: difference: ${difference.toString()}`)
  let total = parseFloat(balanceTokenAInUSDCReal) + parseFloat(balanceTokenBInUSDCReal);
  console.log(`👀  ${process.env.PAIR}: total: ${total.toString()}`)
  let percentageDifference = (difference/total) * 100;
  console.log(`👀  ${process.env.PAIR}: percentageDifference: ${percentageDifference.toString()}`)


  if (percentageDifference > 3) {
    console.log(`ℹ️ ${process.env.PAIR}: Difference  > 3%, swapping!`);
  } else {
      //console.log('La diferencia no es superior al 5%.');
      console.log(`ℹ️ ${process.env.PAIR}: Difference < 3%, not swapping!`);
      return false;
  }

  //debug
  //await new Promise(resolve => setTimeout(resolve, 10000000));

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
