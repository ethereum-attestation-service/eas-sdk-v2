import { EIP712Proxy } from './eip712-proxy';
import { Delegated, Offchain } from './offchain';
import { AttestationRequest, DelegatedAttestationRequest, DelegatedProxyAttestationRequest, DelegatedProxyRevocationRequest, DelegatedRevocationRequest, MultiAttestationRequest, MultiDelegatedAttestationRequest, MultiDelegatedProxyAttestationRequest, MultiDelegatedProxyRevocationRequest, MultiDelegatedRevocationRequest, MultiRevocationRequest, RevocationRequest } from './request';
import { Base, Transaction, type SignerOrProvider, type TransactionOverrides, type TransactionReceipt } from './transaction';
import { WaitableTxResponse } from './utils';
export * from './request';
export interface Attestation {
    uid: string;
    schema: string;
    refUID: string;
    time: bigint;
    expirationTime: bigint;
    revocationTime: bigint;
    recipient: string;
    revocable: boolean;
    attester: string;
    data: string;
}
export interface EASOptions {
    signer?: SignerOrProvider;
    proxy?: EIP712Proxy;
}
export declare function RequireProxy(_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor;
export declare function RequireProxy<TFn extends (this: unknown, ...args: unknown[]) => unknown>(value: TFn, _context: ClassMethodDecoratorContext): TFn;
export declare class EAS extends Base {
    private proxy?;
    private delegated?;
    private offchain?;
    private version?;
    private readonly legacyAbi;
    constructor(address: string, options?: EASOptions);
    connect(signer: SignerOrProvider): this;
    getVersion(): Promise<string>;
    getAttestation(uid: string): Promise<Attestation>;
    isAttestationValid(uid: string): Promise<boolean>;
    isAttestationRevoked(uid: string): Promise<boolean>;
    getTimestamp(data: string): Promise<bigint>;
    getRevocationOffchain(user: string, uid: string): Promise<bigint>;
    getEIP712Proxy(): EIP712Proxy | undefined;
    getDelegated(): Promise<Delegated> | Delegated;
    getOffchain(): Promise<Offchain> | Offchain;
    attest({ schema, data: { recipient, data, expirationTime, revocable, refUID, value } }: AttestationRequest, overrides?: TransactionOverrides): Promise<Transaction<string>>;
    attestByDelegation({ schema, data: { recipient, data, expirationTime, revocable, refUID, value }, signature, attester, deadline }: DelegatedAttestationRequest, overrides?: TransactionOverrides): Promise<Transaction<string>>;
    multiAttest(requests: MultiAttestationRequest[], overrides?: TransactionOverrides): Promise<Transaction<string[]>>;
    multiAttestByDelegation(requests: MultiDelegatedAttestationRequest[], overrides?: TransactionOverrides): Promise<Transaction<string[]>>;
    revoke({ schema, data: { uid, value } }: RevocationRequest, overrides?: TransactionOverrides): Promise<Transaction<void>>;
    revokeByDelegation({ schema, data: { uid, value }, signature, revoker, deadline }: DelegatedRevocationRequest, overrides?: TransactionOverrides): Promise<Transaction<void>>;
    multiRevoke(requests: MultiRevocationRequest[], overrides?: TransactionOverrides): Promise<Transaction<void>>;
    multiRevokeByDelegation(requests: MultiDelegatedRevocationRequest[], overrides?: TransactionOverrides): Promise<Transaction<void>>;
    attestByDelegationProxy(request: DelegatedProxyAttestationRequest, overrides?: TransactionOverrides): Promise<Transaction<string>>;
    multiAttestByDelegationProxy(requests: MultiDelegatedProxyAttestationRequest[], overrides?: TransactionOverrides): Promise<Transaction<string[]>>;
    revokeByDelegationProxy(request: DelegatedProxyRevocationRequest, overrides?: TransactionOverrides): Promise<Transaction<void>>;
    multiRevokeByDelegationProxy(requests: MultiDelegatedProxyRevocationRequest[], overrides?: TransactionOverrides): Promise<Transaction<void>>;
    timestamp(data: string, overrides?: TransactionOverrides): Promise<Transaction<bigint>>;
    multiTimestamp(data: string[], overrides?: TransactionOverrides): Promise<Transaction<bigint[]>>;
    revokeOffchain(uid: string, overrides?: TransactionOverrides): Promise<Transaction<bigint>>;
    multiRevokeOffchain(uids: string[], overrides?: TransactionOverrides): Promise<Transaction<bigint[]>>;
    getDomainSeparator(): Promise<string>;
    getNonce(address: string): Promise<bigint>;
    getAttestTypeHash(): Promise<string>;
    getRevokeTypeHash(): Promise<string>;
    static getAttestationUID: (schema: string, recipient: string, attester: string, time: bigint, expirationTime: bigint, revocable: boolean, refUID: string, data: string, bump: number) => `0x${string}`;
    getUIDFromAttestTx(res: Promise<WaitableTxResponse> | WaitableTxResponse): Promise<string>;
    getUIDsFromMultiAttestTx(res: Promise<WaitableTxResponse> | WaitableTxResponse): Promise<string[]>;
    getUIDsFromAttestReceipt(receipt: TransactionReceipt): string[];
    getTimestampFromTimestampReceipt(receipt: TransactionReceipt): bigint[];
    getTimestampFromOffchainRevocationReceipt(receipt: TransactionReceipt): bigint[];
    simulateAttest(input: {
        schema: string;
        data: {
            recipient: string;
            expirationTime: bigint;
            revocable: boolean;
            refUID: string;
            data: string;
            value: bigint | number;
        };
    }, from?: string): Promise<void>;
    private setDelegated;
    private setOffchain;
    private isLegacyContract;
    private getDataFromReceipt;
}
