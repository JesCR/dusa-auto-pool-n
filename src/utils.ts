import { ChainId, Token } from '@dusalabs/sdk';
import {
  Client,
  EOperationStatus,
  fromMAS,
  IAccount,
  IBaseAccount,
  ProviderType,
  PublicApiClient,
  WalletClient,
  Web3Account,
} from '@massalabs/massa-web3';

export const PUR = new Token(
  ChainId.MAINNET,
  'AS133eqPPaPttJ6hJnk3sfoG5cjFFqBDi1VGxdo2wzWkq8AfZnan',
  18,
  'PUR',
  'Purrfect Universe',
);

export const getClient = async (
  secretKey: string,
): Promise<{
  client: Client;
  account: IAccount;
  baseAccount: IBaseAccount;
  chainId: bigint;
}> => {
  const account = await WalletClient.getAccountFromSecretKey(secretKey);

  const clientConfig = {
    retryStrategyOn: true,
    providers: [
      { url: process.env.JSON_RPC_URL_PUBLIC!, type: ProviderType.PUBLIC },
    ],
    periodOffset: 9,
  };

  const publicApi = new PublicApiClient(clientConfig);
  const status = await publicApi.getNodeStatus();

  const web3account = new Web3Account(account, publicApi, status.chain_id);
  const client = new Client(clientConfig, web3account, publicApi);

  return {
    client,
    account,
    baseAccount: client.wallet().getBaseAccount()!,
    chainId: status.chain_id,
  };
};

export async function waitOp(
  client: Client,
  operationId: string,
  untilFinal = true,
) {
  const status = await client
    .smartContracts()
    .awaitMultipleRequiredOperationStatus(
      operationId,
      [
        EOperationStatus.SPECULATIVE_ERROR,
        EOperationStatus.SPECULATIVE_SUCCESS,
      ],
      230_000,
    );

  const events = await client.smartContracts().getFilteredScOutputEvents({
    start: null,
    end: null,
    original_caller_address: null,
    original_operation_id: operationId,
    emitter_address: null,
    is_final: null,
  });

  if (!untilFinal) return { status, events };

  await client
    .smartContracts()
    .awaitMultipleRequiredOperationStatus(
      operationId,
      [EOperationStatus.FINAL_ERROR, EOperationStatus.FINAL_SUCCESS],
      180_000,
    );

  return {
    status,
    events,
  };
}

export async function getBalance(
  address: string,
  client: Client,
): Promise<bigint> {
  return fromMAS(
    (await client.publicApi().getAddresses([address]))[0].candidate_balance,
  );
}


export const sendTelegramHtml = async (text: string): Promise<void> => {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatID = process.env.TELEGRAM_CHAT_ID;

  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  const body = JSON.stringify({
    chat_id: telegramChatID,
    text: text,
    disable_web_page_preview: true,
    parse_mode: 'HTML'
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: body
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`Error: ${responseData.description} - MSG: ${text}`);
    }

  } catch (error) {
    console.log('Error sending Telegram message: ', text);
    console.error(error);
  }
};

