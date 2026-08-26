import { Abi, type PublicClient, type WalletClient } from 'viem';
export interface TransactionRequest {
    to: string;
    from?: string;
    data?: string;
    value?: bigint;
    gas?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
}
export type TransactionOverrides = Partial<TransactionRequest>;
export interface TransactionLog {
    address: string;
    topics: string[];
    data: string;
}
export interface TransactionReceipt {
    logs: TransactionLog[];
}
export interface TransactionProvider {
    estimateGas: (tx: TransactionRequest) => Promise<bigint>;
    call: (tx: TransactionRequest) => Promise<string>;
    resolveName: (name: string) => Promise<null | string>;
    getNetwork?: () => Promise<{
        chainId: bigint;
    } | {
        chainId: number;
    }>;
}
export interface TransactionSigner extends TransactionProvider {
    sendTransaction: (tx: TransactionRequest) => Promise<unknown>;
    provider?: TransactionProvider;
}
export type SignerOrProvider = TransactionSigner | TransactionProvider | WalletClient | PublicClient;
export declare function RequireSigner(_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor;
export declare function RequireSigner<TFn extends (this: unknown, ...args: unknown[]) => unknown>(value: TFn, _context: ClassMethodDecoratorContext): TFn;
export declare class Transaction<T> {
    readonly data: TransactionRequest;
    receipt?: TransactionReceipt;
    private readonly signer;
    private readonly waitCallback;
    constructor(data: TransactionRequest, signer: TransactionSigner | TransactionProvider, waitCallback: (receipt: TransactionReceipt) => Promise<T>);
    estimateGas(): Promise<bigint>;
    wait(confirmations?: number): Promise<T>;
}
export declare class Base {
    protected readonly abi: Abi;
    protected readonly address: string;
    protected signer?: TransactionSigner | TransactionProvider;
    protected contract: {
        getAddress: () => string;
        runner: {
            provider?: TransactionProvider;
        };
    };
    constructor(abi: Abi, address: string, signer?: SignerOrProvider);
    getAddress(): string;
    connect(signer: SignerOrProvider): this;
    getProvider(): TransactionProvider | undefined;
    protected read<TResult>(functionName: string, args?: unknown[], overrides?: Partial<TransactionRequest>): Promise<TResult>;
    protected readWithAbi<TResult>(abi: Abi, functionName: string, args?: unknown[], overrides?: Partial<TransactionRequest>): Promise<TResult>;
    protected populate(functionName: string, args?: unknown[], overrides?: Partial<TransactionRequest>): TransactionRequest;
    protected populateWithAbi(abi: Abi, functionName: string, args?: unknown[], overrides?: Partial<TransactionRequest>): TransactionRequest;
    getChainId(): Promise<bigint>;
}
