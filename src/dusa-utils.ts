import {
  ChainId,
  PairV2,
  WMAS as _WMAS,
  USDC as _USDC,
  ILBPair,
  parseEther,
} from '@dusalabs/sdk';
import { Client, IAccount } from '@massalabs/massa-web3';
import { config } from 'dotenv';
config();

const CHAIN_ID = ChainId.MAINNET;

export const PAIR_TO_BIN_STEP = {
  'WMAS-USDC': 20,
  'WETH-WMAS': 15,
  'DAI-USDC': 1,
  'PUR-WMAS': 100,
};

export async function getBinsData(
  binStep: number,
  client: Client,
  account: IAccount,
  pair: PairV2,
) {
  const lbPair = await pair.fetchLBPair(binStep, client, CHAIN_ID);
  const lbPairData = await new ILBPair(
    lbPair.LBPair,
    client,
  ).getReservesAndId();

  const activeBinId = lbPairData.activeId;
  

  const pairAddress = lbPair.LBPair;
  //console.log('pairAddress: ', pairAddress)

  const pairContract = new ILBPair(pairAddress, client);
  //console.log('pairContract: ', pairContract)

  const userPositionIds = await pairContract.getUserBinIds(account.address!);
  //console.log('userPositionIds: ', userPositionIds)


  return {
    activeBinId,
    pairContract,
    userPositionIds,
    binStep,
  };
}

/* export async function activeBinInPosition(
  activeBinId: number,
  userPositionIds: number[],
): Promise<boolean> {
  return userPositionIds.includes(activeBinId);
} */

export async function activeBinInPosition(
  activeBinId: number,
  userPositionIds: number[],
): Promise<boolean> {
  const length = userPositionIds.length;

  if (length < 5) {
    return false;
  }

  const start = Math.floor((length - 5) / 2);
  const end = start + 5;

  const centralElements = userPositionIds.slice(start, end);
  /*   if (!centralElements.includes(activeBinId)) {
    console.log(`👀  ${process.env.PAIR} Central Bins in distribtion: ${centralElements}`, true)
    console.log(`👀  ${process.env.PAIR} ActiveBinId: ${activeBinId}`, true)
  } */
  return centralElements.includes(activeBinId);
}


// Copied from https://github.com/dusaprotocol/sdk/blob/37951e65fde644cbdfcedc022700474d6343f983/src/constants/liquidityConfig.ts#L41
/* export const wide = {
  deltaIds: [
    -25, -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11,
    -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
  ],
  distributionX: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0.0196, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392,
    0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392,
    0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392,
  ].map((el) => parseEther(el.toString())),
  distributionY: [
    0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392,
    0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392,
    0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0196, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ].map((el) => parseEther(el.toString())),
}; */

/* export const wide = {
  deltaIds: [
    -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5,
  ],
  distributionX: [
    0, 0, 0, 0, 0, 0.0196, 0.0392, 0.0392, 0.0392, 0.0392, 0.0392,
  ].map((el) => parseEther(el.toString())),
  distributionY: [
    0.0392, 0.0392, 0.0392, 0.0392, 0.0392, 0.0196, 0, 0, 0, 0, 0,
  ].map((el) => parseEther(el.toString())),
};

export const wide = {
  deltaIds: [
    -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5,
  ],
  distributionX: [
    0, 0, 0, 0, 0, 0.0909, 0.1818, 0.1818, 0.1818, 0.1818, 0.1818,
  ].map((el) => parseEther(el.toString())),
  distributionY: [
    0.1818, 0.1818, 0.1818, 0.1818, 0.1818, 0.0909, 0, 0, 0, 0, 0,
  ].map((el) => parseEther(el.toString())),
};
 */



export const wide = {
  deltaIds: [
    -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5,
  ],
  distributionX: [
    0, 0, 0, 0, 0, 0.196, 0.392, 0.392, 0.00667, 0.00666, 0.00666
  ].map((el) => parseEther(el.toString())),
  distributionY: [
    0.00666, 0.00666, 0.00667, 0.392, 0.392, 0.196, 0, 0, 0, 0, 0
  ].map((el) => parseEther(el.toString())),
};
