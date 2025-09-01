import { DelegatedProxy } from './offchain';
import { DelegatedProxyAttestationRequest, DelegatedProxyRevocationRequest, MultiDelegatedProxyAttestationRequest, MultiDelegatedProxyRevocationRequest } from './request';
import { Base, Transaction, type SignerOrProvider, type TransactionOverrides } from './transaction';
export interface EIP712ProxyOptions {
    signer?: SignerOrProvider;
}
export declare class EIP712Proxy extends Base {
    private delegated?;
    constructor(address: string, options?: EIP712ProxyOptions);
    connect(signer: SignerOrProvider): this;
    getVersion(): Promise<string>;
    getEAS(): Promise<string>;
    getName(): Promise<string>;
    getDomainSeparator(): Promise<string>;
    getAttestTypeHash(): Promise<string>;
    getRevokeTypeHash(): Promise<string>;
    getAttester(uid: string): Promise<string>;
    getDelegated(): Promise<DelegatedProxy> | DelegatedProxy;
    attestByDelegationProxy({ schema, data: { recipient, data, expirationTime, revocable, refUID, value }, attester, signature, deadline }: DelegatedProxyAttestationRequest, overrides?: TransactionOverrides): Promise<Transaction<string>>;
    multiAttestByDelegationProxy(requests: MultiDelegatedProxyAttestationRequest[], overrides?: TransactionOverrides): Promise<Transaction<string[]>>;
    revokeByDelegationProxy({ schema, data: { uid, value }, signature, revoker, deadline }: DelegatedProxyRevocationRequest, overrides?: TransactionOverrides): Promise<Transaction<void>>;
    multiRevokeByDelegationProxy(requests: MultiDelegatedProxyRevocationRequest[], overrides?: TransactionOverrides): Promise<Transaction<void>>;
    private setDelegated;
}
