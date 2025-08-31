import { Abi, decodeFunctionResult, encodeFunctionData } from 'viem';

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

export interface TransactionLog {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendTransaction: (tx: TransactionRequest) => Promise<any>;
  provider?: TransactionProvider;
}

// Overloads to support both legacy (experimental) and standard (TC39) decorators
export function RequireSigner(
  _target: unknown,
  _propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RequireSigner<TFn extends (this: unknown, ...args: any[]) => any>(
  value: TFn,
  _context: ClassMethodDecoratorContext
): TFn;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RequireSigner(...args: any[]): any {
  // Standard decorator: (value, context)
  if (args.length === 2) {
    const [value] = args as [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this: unknown, ...fnArgs: any[]) => any,
      ClassMethodDecoratorContext
    ];

    const wrapped = function (
      this: unknown,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...fnArgs: any[]
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signer: TransactionSigner | undefined = (this as any).signer;
      if (!signer || !signer.sendTransaction) {
        throw new Error('Invalid signer');
      }
      return value.apply(this as unknown, fnArgs);
    };

    return wrapped;
  }

  // Legacy decorator: (target, propertyKey, descriptor)
  const [_target, _propertyKey, descriptor] = args as [unknown, string, PropertyDescriptor];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = descriptor.value as unknown as (this: unknown, ...fnArgs: any[]) => unknown;

  descriptor.value = function (
    this: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...fnArgs: any[]
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signer: TransactionSigner | undefined = (this as any).signer;
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

    const tx = await (this.signer as TransactionSigner).sendTransaction(this.data);

    // ethers v6 returns a response with wait(); viem returns hash. We rely on signer to provide wait() on response.
    this.receipt = await tx.wait(confirmations);
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

  constructor(abi: Abi, address: string, signer?: TransactionSigner | TransactionProvider) {
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
  public connect(signer: TransactionSigner | TransactionProvider) {
    this.signer = signer;

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
