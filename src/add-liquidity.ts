import {
  ChainId,
  IRouter,
  LB_ROUTER_ADDRESS,
  LiquidityDistribution,
  PairV2,
  TokenAmount,
  WMAS as _WMAS,
  WETH as _WETH,
  USDC as _USDC,
  Percent,
  ILBPair,
  EventDecoder,
  CompositionFeeEvent,
  LiquidityEvent,
} from '@dusalabs/sdk';
import { Client, EOperationStatus, IAccount } from '@massalabs/massa-web3';
import { getClient, waitOp, sendTelegramHtml } from './utils';
import { PAIR_TO_BIN_STEP } from './dusa-utils';
import { increaseAllowanceIfNeeded } from './allowance';
import { config } from 'dotenv';
import {
  equilibrateBalances,
  getAmountsToAdd,
  getCurrentPrice,
} from './equilibrateBalances';
import BigNumber from 'bignumber.js';
import { getCustomDistribution } from './distribution';
config();

const CHAIN_ID = ChainId.MAINNET;

const WMAS = _WMAS[CHAIN_ID];
const USDC = _USDC[CHAIN_ID];
const WETH = _WETH[CHAIN_ID];

const router = LB_ROUTER_ADDRESS[CHAIN_ID];

export async function addLiquidity(
  binStep: number,
  client: Client,
  account: IAccount,
  tokenAmountA: TokenAmount,
  tokenAmountB: TokenAmount,
  pair: PairV2,
  prices: { oldPrice: BigNumber; currentPrice: BigNumber },
) {
  // set amount slippage tolerance
  const allowedAmountSlippage =
    parseInt(process.env.ALLOWED_AMOUNT_SLIPPAGE || '50') || 50; // in bips

  // set price slippage tolerance
  const allowedPriceSlippage =
    parseInt(process.env.ALLOWED_PRICE_SLIPPAGE || '50') || 50; // in bips

  // set deadline for the transaction
  const currentTimeInMs = new Date().getTime();
  const deadline = currentTimeInMs + 3_600_000;

  const lbPair = await pair.fetchLBPair(binStep, client, CHAIN_ID);
  const lbPairData = await new ILBPair(
    lbPair.LBPair,
    client,
  ).getReservesAndId();

  /* const addLiquidityInput = await pair.addLiquidityParameters(
    lbPair.LBPair,
    binStep,
    tokenAmountA,
    tokenAmountB,
    new Percent(BigInt(allowedAmountSlippage)),
    new Percent(BigInt(allowedPriceSlippage)),
    LiquidityDistribution.SPOT,
    client,
  );

  const customDistribution = getCustomDistribution(prices);
  if (customDistribution.deltaIds.length === 0) {
    throw Error('abort adding liquidity');
  }
  if (customDistribution.deltaIds.length > 1) {
    await equilibrateBalances(client, account, pair, prices.oldPrice);
  } */

  
  const customDistribution = getCustomDistribution(prices);
  if (customDistribution.deltaIds.length === 0) {
    throw Error('abort adding liquidity');
  }



  if (customDistribution.deltaIds.length > 1) {
    // Equilibrate balances if necessary
    const shouldRecalculate = await equilibrateBalances(client, account, pair, prices.oldPrice);
    //console.log('shouldRecalculate: ', shouldRecalculate)
    
    if (shouldRecalculate) {
      // Wait for 10 seconds before proceeding
      await new Promise(resolve => setTimeout(resolve, 10000));

      const amounts = await getAmountsToAdd(client, account, pair);

      const amountANumerator = BigInt(amounts.amountA.numerator);
      const amountBNumerator = BigInt(amounts.amountB.numerator);
      console.log('amountANumerator (WETH): ', amountANumerator);
      console.log('amountBNumerator (MAS): ', amountBNumerator);

      tokenAmountA = new TokenAmount(pair.tokenA, amountANumerator);
      tokenAmountB = new TokenAmount(pair.tokenB, amountBNumerator);
    }

    // Equilibrate balances if necessary
    const shouldRecalculateSecondPass = await equilibrateBalances(client, account, pair, prices.oldPrice);
    //console.log('shouldRecalculate: ', shouldRecalculate)
    
    if (shouldRecalculateSecondPass) {
      // Wait for 10 seconds before proceeding
      await new Promise(resolve => setTimeout(resolve, 10000));

      const amounts = await getAmountsToAdd(client, account, pair);

      const amountANumerator = BigInt(amounts.amountA.numerator);
      const amountBNumerator = BigInt(amounts.amountB.numerator);
      console.log('amountANumerator (WETH): ', amountANumerator);
      console.log('amountBNumerator (MAS): ', amountBNumerator);

      tokenAmountA = new TokenAmount(pair.tokenA, amountANumerator);
      tokenAmountB = new TokenAmount(pair.tokenB, amountBNumerator);
    }
  }

  


  // Prepare parameters for adding liquidity
  const addLiquidityInput = await pair.addLiquidityParameters(
    lbPair.LBPair,
    binStep,
    tokenAmountA,
    tokenAmountB,
    new Percent(BigInt(allowedAmountSlippage)),
    new Percent(BigInt(allowedPriceSlippage)),
    LiquidityDistribution.SPOT,
    client,
  );

  const params = pair.liquidityCallParameters({
    ...addLiquidityInput,
    ...customDistribution,
    activeIdDesired: lbPairData.activeId,
    to: account.address!,
    deadline,
  });

  // increase allowance
  await increaseAllowanceIfNeeded(
    client,
    account,
    pair.tokenA,
    tokenAmountA.raw,
  );
  await increaseAllowanceIfNeeded(
    client,
    account,
    pair.tokenB,
    tokenAmountB.raw,
  );

  // add liquidity

  const opId = await new IRouter(router, client).add(params);
 
  console.log(
    `➕  ${process.env.PAIR} ADDING LIQUIDITY\n${tokenAmountA.toSignificant(tokenAmountA.token.decimals,)} ${tokenAmountA.token.symbol} and ${tokenAmountB.toSignificant(tokenAmountB.token.decimals,)} ${tokenAmountB.token.symbol}\nhttps://www.massexplo.io/tx/${opId}`
    , true
  );
  const { status, events } = await waitOp(client, opId, false);
  console.log('status: ', status);

  let compositionFeeEvent: CompositionFeeEvent | undefined;
  const depositEvents: LiquidityEvent[] = [];
  events.map((l) => {
    const data = l.data;
    if (data.startsWith('COMPOSITION_FEE:')) {
      compositionFeeEvent = EventDecoder.decodeCompositionFee(data);
    } else if (data.startsWith('DEPOSITED_TO_BIN:')) {
      const depositEvent = EventDecoder.decodeLiquidity(data);
      depositEvents.push(depositEvent);
    } else if (status === EOperationStatus.SPECULATIVE_ERROR) {
      console.error('Error adding liquidity: ', l, true);
    }
  });

  return { compositionFeeEvent, depositEvents };
}

async function main() {
  const { client, account } = await getClient(process.env.WALLET_SECRET_KEY!);

  // const pair = new PairV2(WMAS, USDC);
  // const binStep = PAIR_TO_BIN_STEP['WMAS-USDC'];

  const pair = new PairV2(WETH, WMAS);
  const binStep = PAIR_TO_BIN_STEP['WETH-WMAS'];
  console.log('token 0: ' + pair.tokenA.name, true);
  console.log('token 1: ' + pair.tokenB.name, true);

  const { amountA, amountB } = await getAmountsToAdd(client, account, pair);
  const currentPrice = await getCurrentPrice(client, pair, binStep);

  const { depositEvents } = await addLiquidity(
    binStep,
    client,
    account,
    amountA,
    amountB,
    pair,
    {
      oldPrice: currentPrice,
      currentPrice: currentPrice.multipliedBy(1.71),
    },
  );
  depositEvents.map(console.log);
}

// await main();
