import EASArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json';
import { keccak256, toUtf8Bytes } from 'ethers';
import { Abi, decodeEventLog } from 'viem';
import type { TransactionReceipt } from './transaction';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_BYTES = '0x';
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

enum Event {
  Attested = 'Attested',
  Timestamped = 'Timestamped',
  RevokedOffchain = 'RevokedOffchain'
}

const TOPICS = {
  [Event.Attested]: keccak256(toUtf8Bytes('Attested(address,address,bytes32,bytes32)')),
  [Event.Timestamped]: keccak256(toUtf8Bytes('Timestamped(bytes32,uint64)')),
  [Event.RevokedOffchain]: keccak256(toUtf8Bytes('RevokedOffchain(address,bytes32,uint64)'))
};

const getDataFromReceipt = (receipt: TransactionReceipt, event: Event, attribute: string): string[] => {
  const abi = (EASArtifact as { abi: Abi }).abi;
  const logs = receipt.logs.filter((l) => l.topics[0] === TOPICS[event]);
  if (logs.length === 0) {
    throw new Error(`Unable to process ${event} events`);
  }

  return logs.map((log) => {
    const decoded = decodeEventLog({
      abi,
      topics: log.topics as unknown as [`0x${string}`, ...`0x${string}`[]],
      data: log.data as `0x${string}`
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (decoded as any).args[attribute] as string;
  });
};

export const getUIDsFromAttestReceipt = (receipt: TransactionReceipt): string[] =>
  getDataFromReceipt(receipt, Event.Attested, 'uid');

export const getTimestampFromTimestampReceipt = (receipt: TransactionReceipt): bigint[] =>
  getDataFromReceipt(receipt, Event.Timestamped, 'timestamp').map((s) => BigInt(s));

export const getTimestampFromOffchainRevocationReceipt = (receipt: TransactionReceipt): bigint[] =>
  getDataFromReceipt(receipt, Event.RevokedOffchain, 'timestamp').map((s) => BigInt(s));

// Keep legacy helpers for ethers-style TransactionResponse inputs
type WaitableTxResponse = { wait: (confirmations?: number) => Promise<unknown> };

export const getUIDFromAttestTx = async (res: Promise<WaitableTxResponse> | WaitableTxResponse): Promise<string> => {
  return (await getUIDsFromMultiAttestTx(res))[0];
};

export const getUIDsFromMultiAttestTx = async (
  res: Promise<WaitableTxResponse> | WaitableTxResponse
): Promise<string[]> => {
  const tx = await res;
  // Ethers responses expose wait(); cast the receipt to our minimal shape
  const receipt = (await tx.wait()) as unknown as TransactionReceipt | undefined;
  if (!receipt) {
    throw new Error(`Unable to confirm: ${tx}`);
  }

  return getUIDsFromAttestReceipt(receipt);
};
