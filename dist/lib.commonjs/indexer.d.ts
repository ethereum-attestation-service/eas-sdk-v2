import { Base, Transaction, type SignerOrProvider, type TransactionOverrides } from './transaction';
export interface IndexerOptions {
    signer?: SignerOrProvider;
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
export interface GetReceivedAttestationUIDsOptions extends GetReceivedAttestationUIDCountOptions, PaginationOptions {
}
export interface GetSentAttestationUIDCountOptions {
    attester: string;
    schema: string;
}
export interface GetSentAttestationUIDsOptions extends GetSentAttestationUIDCountOptions, PaginationOptions {
}
export interface GetSchemaAttesterRecipientAttestationUIDsOptions extends GetSchemaAttesterRecipientAttestationUIDCountOptions, PaginationOptions {
}
export interface GetSchemaAttesterRecipientAttestationUIDCountOptions {
    schema: string;
    attester: string;
    recipient: string;
}
export interface GetSchemaAttestationUIDsOptions extends GetSchemaAttestationUIDCountOptions, PaginationOptions {
}
export interface GetSchemaAttestationUIDCountOptions {
    schema: string;
}
export declare class Indexer extends Base {
    private delegated?;
    constructor(address: string, options?: IndexerOptions);
    connect(signer: SignerOrProvider): this;
    getVersion(): Promise<string>;
    getEAS(): Promise<string>;
    indexAttestation({ uid }: IndexAttestationOptions, overrides?: TransactionOverrides): Promise<Transaction<void>>;
    indexAttestations({ uids }: IndexAttestationsOptions, overrides?: TransactionOverrides): Promise<Transaction<void>>;
    isAttestationIndexed({ uid }: IsAttestationIndexedOptions): Promise<boolean>;
    getReceivedAttestationUIDs({ recipient, schema, start, length, reverseOrder }: GetReceivedAttestationUIDsOptions): Promise<string[]>;
    getReceivedAttestationUIDCount({ recipient, schema }: GetReceivedAttestationUIDCountOptions): Promise<bigint>;
    getSentAttestationUIDs({ attester, schema, start, length, reverseOrder }: GetSentAttestationUIDsOptions): Promise<string[]>;
    getSentAttestationUIDCount({ attester, schema }: GetSentAttestationUIDCountOptions): Promise<bigint>;
    getSchemaAttesterRecipientAttestationUIDs({ schema, attester, recipient, start, length, reverseOrder }: GetSchemaAttesterRecipientAttestationUIDsOptions): Promise<string[]>;
    getSchemaAttesterRecipientAttestationUIDCount({ schema, attester, recipient }: GetSchemaAttesterRecipientAttestationUIDCountOptions): Promise<bigint>;
    getSchemaAttestationUIDs({ schema, start, length, reverseOrder }: GetSchemaAttestationUIDsOptions): Promise<string[]>;
    getSchemaAttestationUIDCount({ schema }: GetSchemaAttestationUIDCountOptions): Promise<bigint>;
}
