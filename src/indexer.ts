import IndexerArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/Indexer.sol/Indexer.json';
import type { Abi } from 'viem';
import { legacyVersion } from './legacy/version';
import { DelegatedProxy } from './offchain';
import { Base, RequireSigner, Transaction, TransactionProvider, TransactionSigner } from './transaction';

export interface IndexerOptions {
  signer?: TransactionSigner | TransactionProvider;
}

export interface UIDOptions {
  uid: string;
}

export type IndexAttestationOptions = UIDOptions;

export interface IndexAttestationsOptions {
  uids: string[];
}

export type IsAttestationIndexedOptions = UIDOptions;

export interface PaginationOptions {
  start: bigint;
  length: bigint;
  reverseOrder: boolean;
}

export interface GetReceivedAttestationUIDCountOptions {
  recipient: string;
  schema: string;
}

export interface GetReceivedAttestationUIDsOptions extends GetReceivedAttestationUIDCountOptions, PaginationOptions {}

export interface GetSentAttestationUIDCountOptions {
  attester: string;
  schema: string;
}

export interface GetSentAttestationUIDsOptions extends GetSentAttestationUIDCountOptions, PaginationOptions {}

export interface GetSchemaAttesterRecipientAttestationUIDsOptions
  extends GetSchemaAttesterRecipientAttestationUIDCountOptions,
    PaginationOptions {}

export interface GetSchemaAttesterRecipientAttestationUIDCountOptions {
  schema: string;
  attester: string;
  recipient: string;
}

export interface GetSchemaAttestationUIDsOptions extends GetSchemaAttestationUIDCountOptions, PaginationOptions {}

export interface GetSchemaAttestationUIDCountOptions {
  schema: string;
}

export class Indexer extends Base {
  private delegated?: DelegatedProxy;

  constructor(address: string, options?: IndexerOptions) {
    const { signer } = options || {};

    super((IndexerArtifact as { abi: Abi }).abi as Abi, address, signer);
  }

  // Connects the API to a specific signer
  public connect(signer: TransactionSigner | TransactionProvider) {
    delete this.delegated;

    super.connect(signer);

    return this;
  }

  // Returns the version of the contract
  public async getVersion(): Promise<string> {
    return (
      (await legacyVersion({
        getAddress: () => this.getAddress(),
        runner: { provider: this.getProvider() }
      } as unknown as { getAddress: () => Promise<string> | string; runner?: { provider?: TransactionProvider } })) ??
      this.read<string>('version')
    );
  }

  // Returns the address of the EAS contract
  public getEAS(): Promise<string> {
    return this.read<string>('getEAS');
  }

  // Indexes an existing attestation
  // eslint-disable-next-line require-await
  @RequireSigner
  public async indexAttestation(
    { uid }: IndexAttestationOptions,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
    const tx = this.populate('indexAttestation', [uid], overrides);
    return new Transaction(tx, this.signer!, async () => {});
  }

  // Indexes multiple existing attestations
  // eslint-disable-next-line require-await
  @RequireSigner
  public async indexAttestations(
    { uids }: IndexAttestationsOptions,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
    const tx = this.populate('indexAttestations', [uids], overrides);
    return new Transaction(tx, this.signer!, () => Promise.resolve(undefined));
  }

  public isAttestationIndexed({ uid }: IsAttestationIndexedOptions): Promise<boolean> {
    return this.read<boolean>('isAttestationIndexed', [uid]);
  }

  public getReceivedAttestationUIDs({
    recipient,
    schema,
    start,
    length,
    reverseOrder
  }: GetReceivedAttestationUIDsOptions): Promise<string[]> {
    return this.read<string[]>('getReceivedAttestationUIDs', [recipient, schema, start, length, reverseOrder]);
  }

  public getReceivedAttestationUIDCount({ recipient, schema }: GetReceivedAttestationUIDCountOptions): Promise<bigint> {
    return this.read<bigint>('getReceivedAttestationUIDCount', [recipient, schema]);
  }

  public getSentAttestationUIDs({
    attester,
    schema,
    start,
    length,
    reverseOrder
  }: GetSentAttestationUIDsOptions): Promise<string[]> {
    return this.read<string[]>('getSentAttestationUIDs', [attester, schema, start, length, reverseOrder]);
  }

  public getSentAttestationUIDCount({ attester, schema }: GetSentAttestationUIDCountOptions): Promise<bigint> {
    return this.read<bigint>('getSentAttestationUIDCount', [attester, schema]);
  }

  public getSchemaAttesterRecipientAttestationUIDs({
    schema,
    attester,
    recipient,
    start,
    length,
    reverseOrder
  }: GetSchemaAttesterRecipientAttestationUIDsOptions): Promise<string[]> {
    return this.read<string[]>('getSchemaAttesterRecipientAttestationUIDs', [
      schema,
      attester,
      recipient,
      start,
      length,
      reverseOrder
    ]);
  }

  public getSchemaAttesterRecipientAttestationUIDCount({
    schema,
    attester,
    recipient
  }: GetSchemaAttesterRecipientAttestationUIDCountOptions): Promise<bigint> {
    return this.read<bigint>('getSchemaAttesterRecipientAttestationUIDCount', [schema, attester, recipient]);
  }

  public getSchemaAttestationUIDs({
    schema,
    start,
    length,
    reverseOrder
  }: GetSchemaAttestationUIDsOptions): Promise<string[]> {
    return this.read<string[]>('getSchemaAttestationUIDs', [schema, start, length, reverseOrder]);
  }

  public getSchemaAttestationUIDCount({ schema }: GetSchemaAttestationUIDCountOptions): Promise<bigint> {
    return this.read<bigint>('getSchemaAttestationUIDCount', [schema]);
  }
}
