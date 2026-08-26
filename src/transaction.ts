import {
  Abi,
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type PublicClient,
  type WalletClient
} from 'viem';
import { WaitableTxResponse } from './utils';

// Minimal transaction request/receipt/log shapes to avoid depending on ethers types
export interface TransactionRequest {
  to: string;
  from?: string;
  data?: string;
  value?: bigint;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

// Public alias for commonly used partial overrides shape
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
  // Optional network accessor (for chain id)
  getNetwork?: () => Promise<{ chainId: bigint } | { chainId: number }>;
}

export interface TransactionSigner extends TransactionProvider {
  sendTransaction: (tx: TransactionRequest) => Promise<unknown>;
  provider?: TransactionProvider;
}

export type SignerOrProvider = TransactionSigner | TransactionProvider | WalletClient | PublicClient;

type RequestFn = <TResult = unknown>(args: { method: string; params?: unknown[] }) => Promise<TResult>;

class TxClientAdapter {
  public static mapTxRequestToViem(tx: TransactionRequest): {
    account?: Address;
    to: Address;
    data?: `0x${string}`;
    value?: bigint;
    gas?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  } {
    return {
      account: (tx.from as Address | undefined) ?? undefined,
      to: tx.to as Address,
      data: tx.data as `0x${string}` | undefined,
      value: tx.value,
      gas: tx.gas,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas
    };
  }

  public static toRpcQuantity(value?: bigint): `0x${string}` | undefined {
    if (value === undefined) {
      return undefined;
    }
    return `0x${value.toString(16)}` as `0x${string}`;
  }

  public static toRpcTx(tx: TransactionRequest): {
    to: Address;
    from?: Address;
    data?: `0x${string}`;
    value?: `0x${string}`;
    gas?: `0x${string}`;
    maxFeePerGas?: `0x${string}`;
    maxPriorityFeePerGas?: `0x${string}`;
  } {
    return {
      to: tx.to as Address,
      from: tx.from as Address | undefined,
      data: tx.data as `0x${string}` | undefined,
      value: this.toRpcQuantity(tx.value),
      gas: this.toRpcQuantity(tx.gas),
      maxFeePerGas: this.toRpcQuantity(tx.maxFeePerGas),
      maxPriorityFeePerGas: this.toRpcQuantity(tx.maxPriorityFeePerGas)
    };
  }

  public static createProviderAdapter(publicClient: PublicClient): TransactionProvider {
    return {
      estimateGas: async (tx: TransactionRequest) => {
        const res = await publicClient.estimateGas(this.mapTxRequestToViem(tx));
        return res;
      },
      call: async (tx: TransactionRequest) => {
        const res = await publicClient.call(this.mapTxRequestToViem(tx));
        return res as unknown as string;
      },
      resolveName: async (name: string) => {
        const addr = await publicClient.getEnsAddress({ name });
        return (addr as unknown as string) ?? null;
      },
      getNetwork: async () => ({ chainId: await publicClient.getChainId() })
    };
  }

  public static createProviderFromWallet(walletClient: WalletClient): TransactionProvider {
    const request: RequestFn = (walletClient as unknown as { request: RequestFn }).request.bind(
      walletClient as unknown as object
    );
    return {
      estimateGas: async (tx: TransactionRequest) => {
        const hex = await request<string>({
          method: 'eth_estimateGas',
          params: [this.toRpcTx(tx)]
        });
        return BigInt(hex);
      },
      call: async (tx: TransactionRequest) => {
        const data = await request<string>({
          method: 'eth_call',
          params: [this.toRpcTx(tx), 'latest']
        });
        return data;
      },
      resolveName: (_name: string) => Promise.resolve(null),
      getNetwork: async () => {
        const hex = await request<string>({ method: 'eth_chainId' });
        return { chainId: BigInt(hex) };
      }
    };
  }

  public static createSignerAdapter(walletClient: WalletClient, publicClient?: PublicClient): TransactionSigner {
    const pc = publicClient;
    const provider = pc ? this.createProviderAdapter(pc) : this.createProviderFromWallet(walletClient);
    return {
      ...provider,
      provider,
      sendTransaction: async (tx: TransactionRequest) => {
        const params = this.mapTxRequestToViem(tx);
        const account = (params.account ?? (walletClient.account as Address | undefined)) as Address | undefined;
        const hash = await (
          walletClient as unknown as { sendTransaction: (args: Record<string, unknown>) => Promise<`0x${string}`> }
        ).sendTransaction(account ? { ...params, account } : params);
        return {
          wait: async (confirmations?: number) => {
            if (pc) {
              const receipt = await pc.waitForTransactionReceipt({ hash, confirmations });
              return {
                logs: receipt.logs.map((l) => ({
                  address: l.address as string,
                  topics: l.topics as unknown as string[],
                  data: l.data as string
                }))
              } as TransactionReceipt;
            }
            const request: RequestFn = (walletClient as unknown as { request: RequestFn }).request.bind(
              walletClient as unknown as object
            );
            for (;;) {
              const r = await request<null | {
                logs: { address: string; topics: string[]; data: string }[];
              }>({
                method: 'eth_getTransactionReceipt',
                params: [hash]
              });
              if (r) {
                return {
                  logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data }))
                } as TransactionReceipt;
              }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        } as { wait: (confirmations?: number) => Promise<TransactionReceipt> };
      }
    };
  }

  public static adaptSignerOrProvider(input: SignerOrProvider): TransactionSigner | TransactionProvider {
    // viem WalletClient: has request() and sendTransaction()
    if (
      typeof (input as { request?: unknown }).request === 'function' &&
      typeof (input as { sendTransaction?: unknown }).sendTransaction === 'function'
    ) {
      const wallet = input as WalletClient & { account?: Address | undefined };
      if (wallet.account) {
        return this.createSignerAdapter(wallet);
      }
      return this.createProviderFromWallet(wallet);
    }

    // viem PublicClient: has request() and getChainId()
    if (
      typeof (input as { request?: unknown }).request === 'function' &&
      typeof (input as { getChainId?: unknown }).getChainId === 'function'
    ) {
      return this.createProviderAdapter(input as PublicClient);
    }

    // Generic shapes
    const maybe = input as TransactionSigner | TransactionProvider;
    if (typeof (maybe as TransactionSigner).sendTransaction === 'function') {
      return maybe as TransactionSigner;
    }
    if (
      typeof (maybe as TransactionProvider).estimateGas === 'function' &&
      typeof (maybe as TransactionProvider).call === 'function'
    ) {
      return maybe as TransactionProvider;
    }

    throw new Error('Unsupported signer/provider input');
  }
}

// Overloads to support both legacy (experimental) and standard (TC39) decorators
export function RequireSigner(
  _target: unknown,
  _propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor;

export function RequireSigner<TFn extends (this: unknown, ...args: unknown[]) => unknown>(
  value: TFn,
  _context: ClassMethodDecoratorContext
): TFn;

export function RequireSigner(...args: unknown[]): unknown {
  // Standard decorator: (value, context)
  if (args.length === 2) {
    const [value] = args as [(this: unknown, ...fnArgs: unknown[]) => unknown, ClassMethodDecoratorContext];

    const wrapped = function (this: unknown, ...fnArgs: unknown[]) {
      const signer: TransactionSigner | undefined = (this as { signer?: unknown }).signer as
        | TransactionSigner
        | undefined;
      if (!signer || !signer.sendTransaction) {
        throw new Error('Invalid signer');
      }
      return value.apply(this as unknown, fnArgs);
    };

    return wrapped;
  }

  // Legacy decorator: (target, propertyKey, descriptor)
  const [_target, _propertyKey, descriptor] = args as [unknown, string, PropertyDescriptor];

  const original = descriptor.value as unknown as (this: unknown, ...fnArgs: unknown[]) => unknown;

  descriptor.value = function (this: unknown, ...fnArgs: unknown[]) {
    const signer: TransactionSigner | undefined = (this as { signer?: unknown }).signer as
      | TransactionSigner
      | undefined;
    if (!signer || !signer.sendTransaction) {
      throw new Error('Invalid signer');
    }
    return original.apply(this as unknown, fnArgs);
  };

  return descriptor;
}

export class Transaction<T> {
  public readonly data: TransactionRequest;
  public receipt?: TransactionReceipt;
  private readonly signer: TransactionSigner | TransactionProvider;
  private readonly waitCallback: (receipt: TransactionReceipt) => Promise<T>;

  constructor(
    data: TransactionRequest,
    signer: TransactionSigner | TransactionProvider,
    waitCallback: (receipt: TransactionReceipt) => Promise<T>
  ) {
    this.data = data;
    this.signer = signer;
    this.waitCallback = waitCallback;
  }

  // Estimate gas for the transaction
  public estimateGas(): Promise<bigint> {
    return this.signer.estimateGas(this.data);
  }

  @RequireSigner
  public async wait(confirmations?: number): Promise<T> {
    if (this.receipt) {
      throw new Error(`Transaction already broadcast: ${this.receipt}`);
    }

    const tx = (await (this.signer as TransactionSigner).sendTransaction(this.data)) as unknown as WaitableTxResponse;

    // ethers v6 returns a response with wait(); viem returns hash. We rely on signer to provide wait() on response.
    this.receipt = (await tx.wait(confirmations)) as unknown as TransactionReceipt;
    if (!this.receipt) {
      throw new Error(`Unable to confirm: ${tx}`);
    }

    return this.waitCallback(this.receipt);
  }
}

export class Base {
  protected readonly abi: Abi;
  protected readonly address: string;
  protected signer?: TransactionSigner | TransactionProvider;
  protected contract: { getAddress: () => string; runner: { provider?: TransactionProvider } };

  constructor(abi: Abi, address: string, signer?: SignerOrProvider) {
    this.abi = abi;
    this.address = address;
    this.contract = {
      getAddress: () => this.getAddress(),
      runner: { provider: undefined }
    };
    if (signer) {
      this.connect(signer);
    }
  }

  public getAddress(): string {
    return this.address;
  }

  // Connects the API to a specific signer or provider
  public connect(signer: SignerOrProvider) {
    this.signer = TxClientAdapter.adaptSignerOrProvider(signer);

    this.contract.runner.provider = this.getProvider();

    return this;
  }

  public getProvider(): TransactionProvider | undefined {
    return (this.signer as TransactionSigner | undefined)?.provider ?? this.signer;
  }

  // Generic read using this contract's ABI
  protected async read<TResult>(
    functionName: string,
    args: unknown[] = [],
    overrides: Partial<TransactionRequest> = {}
  ): Promise<TResult> {
    const provider = this.getProvider();
    if (!provider) {
      throw new Error('provider was not set');
    }

    const data = encodeFunctionData({ abi: this.abi, functionName, args });
    const raw = await provider.call({ to: this.address, data, ...overrides });
    return decodeFunctionResult({ abi: this.abi, functionName, data: raw as `0x${string}` }) as TResult;
  }

  // Read using a custom ABI fragment (useful for legacy-specific queries)
  protected async readWithAbi<TResult>(
    abi: Abi,
    functionName: string,
    args: unknown[] = [],
    overrides: Partial<TransactionRequest> = {}
  ): Promise<TResult> {
    const provider = this.getProvider();
    if (!provider) {
      throw new Error('provider was not set');
    }

    const data = encodeFunctionData({ abi, functionName, args });
    const raw = await provider.call({ to: this.address, data, ...overrides });
    return decodeFunctionResult({ abi, functionName, data: raw as `0x${string}` }) as TResult;
  }

  // Create a transaction request for a contract write call
  protected populate(functionName: string, args: unknown[] = [], overrides: Partial<TransactionRequest> = {}) {
    const data = encodeFunctionData({ abi: this.abi, functionName, args });
    const tx: TransactionRequest = { to: this.address, data, ...overrides };
    return tx;
  }

  // Create a transaction request using a custom ABI
  protected populateWithAbi(
    abi: Abi,
    functionName: string,
    args: unknown[] = [],
    overrides: Partial<TransactionRequest> = {}
  ) {
    const data = encodeFunctionData({ abi, functionName, args });
    const tx: TransactionRequest = { to: this.address, data, ...overrides };
    return tx;
  }

  // Gets the chain ID
  public async getChainId(): Promise<bigint> {
    const provider: TransactionProvider | undefined =
      (this.signer as TransactionSigner | undefined)?.provider ?? this.signer;
    if (!provider || !provider.getNetwork) {
      throw new Error("Unable to get the chain ID: provider wasn't set");
    }

    const network = await provider.getNetwork();
    const chainId = (network as { chainId: bigint }).chainId ?? BigInt((network as { chainId: number }).chainId);
    return chainId;
  }
}
