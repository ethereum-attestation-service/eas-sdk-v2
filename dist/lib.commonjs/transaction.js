"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Base = exports.Transaction = void 0;
exports.RequireSigner = RequireSigner;
const tslib_1 = require("tslib");
const viem_1 = require("viem");
class TxClientAdapter {
    static mapTxRequestToViem(tx) {
        return {
            account: tx.from ?? undefined,
            to: tx.to,
            data: tx.data,
            value: tx.value,
            gas: tx.gas,
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas
        };
    }
    static toRpcQuantity(value) {
        if (value === undefined) {
            return undefined;
        }
        return `0x${value.toString(16)}`;
    }
    static toRpcTx(tx) {
        return {
            to: tx.to,
            from: tx.from,
            data: tx.data,
            value: this.toRpcQuantity(tx.value),
            gas: this.toRpcQuantity(tx.gas),
            maxFeePerGas: this.toRpcQuantity(tx.maxFeePerGas),
            maxPriorityFeePerGas: this.toRpcQuantity(tx.maxPriorityFeePerGas)
        };
    }
    static createProviderAdapter(publicClient) {
        return {
            estimateGas: async (tx) => {
                const res = await publicClient.estimateGas(this.mapTxRequestToViem(tx));
                return res;
            },
            call: async (tx) => {
                const res = await publicClient.call(this.mapTxRequestToViem(tx));
                return res;
            },
            resolveName: async (name) => {
                const addr = await publicClient.getEnsAddress({ name });
                return addr ?? null;
            },
            getNetwork: async () => ({ chainId: await publicClient.getChainId() })
        };
    }
    static createProviderFromWallet(walletClient) {
        const request = walletClient.request.bind(walletClient);
        return {
            estimateGas: async (tx) => {
                const hex = await request({
                    method: 'eth_estimateGas',
                    params: [this.toRpcTx(tx)]
                });
                return BigInt(hex);
            },
            call: async (tx) => {
                const data = await request({
                    method: 'eth_call',
                    params: [this.toRpcTx(tx), 'latest']
                });
                return data;
            },
            resolveName: (_name) => Promise.resolve(null),
            getNetwork: async () => {
                const hex = await request({ method: 'eth_chainId' });
                return { chainId: BigInt(hex) };
            }
        };
    }
    static createSignerAdapter(walletClient, publicClient) {
        const pc = publicClient;
        const provider = pc ? this.createProviderAdapter(pc) : this.createProviderFromWallet(walletClient);
        return {
            ...provider,
            provider,
            sendTransaction: async (tx) => {
                const params = this.mapTxRequestToViem(tx);
                const account = (params.account ?? walletClient.account);
                const hash = await walletClient.sendTransaction(account ? { ...params, account } : params);
                return {
                    wait: async (confirmations) => {
                        if (pc) {
                            const receipt = await pc.waitForTransactionReceipt({ hash, confirmations });
                            return {
                                logs: receipt.logs.map((l) => ({ topics: l.topics, data: l.data }))
                            };
                        }
                        const request = walletClient.request.bind(walletClient);
                        for (;;) {
                            const r = await request({
                                method: 'eth_getTransactionReceipt',
                                params: [hash]
                            });
                            if (r) {
                                return { logs: r.logs.map((l) => ({ topics: l.topics, data: l.data })) };
                            }
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }
                    }
                };
            }
        };
    }
    static adaptSignerOrProvider(input) {
        // viem WalletClient: has request() and sendTransaction()
        if (typeof input.request === 'function' &&
            typeof input.sendTransaction === 'function') {
            const wallet = input;
            if (wallet.account) {
                return this.createSignerAdapter(wallet);
            }
            return this.createProviderFromWallet(wallet);
        }
        // viem PublicClient: has request() and getChainId()
        if (typeof input.request === 'function' &&
            typeof input.getChainId === 'function') {
            return this.createProviderAdapter(input);
        }
        // Generic shapes
        const maybe = input;
        if (typeof maybe.sendTransaction === 'function') {
            return maybe;
        }
        if (typeof maybe.estimateGas === 'function' &&
            typeof maybe.call === 'function') {
            return maybe;
        }
        throw new Error('Unsupported signer/provider input');
    }
}
function RequireSigner(...args) {
    // Standard decorator: (value, context)
    if (args.length === 2) {
        const [value] = args;
        const wrapped = function (...fnArgs) {
            const signer = this.signer;
            if (!signer || !signer.sendTransaction) {
                throw new Error('Invalid signer');
            }
            return value.apply(this, fnArgs);
        };
        return wrapped;
    }
    // Legacy decorator: (target, propertyKey, descriptor)
    const [_target, _propertyKey, descriptor] = args;
    const original = descriptor.value;
    descriptor.value = function (...fnArgs) {
        const signer = this.signer;
        if (!signer || !signer.sendTransaction) {
            throw new Error('Invalid signer');
        }
        return original.apply(this, fnArgs);
    };
    return descriptor;
}
class Transaction {
    data;
    receipt;
    signer;
    waitCallback;
    constructor(data, signer, waitCallback) {
        this.data = data;
        this.signer = signer;
        this.waitCallback = waitCallback;
    }
    // Estimate gas for the transaction
    estimateGas() {
        return this.signer.estimateGas(this.data);
    }
    async wait(confirmations) {
        if (this.receipt) {
            throw new Error(`Transaction already broadcast: ${this.receipt}`);
        }
        const tx = (await this.signer.sendTransaction(this.data));
        // ethers v6 returns a response with wait(); viem returns hash. We rely on signer to provide wait() on response.
        this.receipt = (await tx.wait(confirmations));
        if (!this.receipt) {
            throw new Error(`Unable to confirm: ${tx}`);
        }
        return this.waitCallback(this.receipt);
    }
}
exports.Transaction = Transaction;
tslib_1.__decorate([
    RequireSigner,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Number]),
    tslib_1.__metadata("design:returntype", Promise)
], Transaction.prototype, "wait", null);
class Base {
    abi;
    address;
    signer;
    contract;
    constructor(abi, address, signer) {
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
    getAddress() {
        return this.address;
    }
    // Connects the API to a specific signer or provider
    connect(signer) {
        this.signer = TxClientAdapter.adaptSignerOrProvider(signer);
        this.contract.runner.provider = this.getProvider();
        return this;
    }
    getProvider() {
        return this.signer?.provider ?? this.signer;
    }
    // Generic read using this contract's ABI
    async read(functionName, args = [], overrides = {}) {
        const provider = this.getProvider();
        if (!provider) {
            throw new Error('provider was not set');
        }
        const data = (0, viem_1.encodeFunctionData)({ abi: this.abi, functionName, args });
        const raw = await provider.call({ to: this.address, data, ...overrides });
        return (0, viem_1.decodeFunctionResult)({ abi: this.abi, functionName, data: raw });
    }
    // Read using a custom ABI fragment (useful for legacy-specific queries)
    async readWithAbi(abi, functionName, args = [], overrides = {}) {
        const provider = this.getProvider();
        if (!provider) {
            throw new Error('provider was not set');
        }
        const data = (0, viem_1.encodeFunctionData)({ abi, functionName, args });
        const raw = await provider.call({ to: this.address, data, ...overrides });
        return (0, viem_1.decodeFunctionResult)({ abi, functionName, data: raw });
    }
    // Create a transaction request for a contract write call
    populate(functionName, args = [], overrides = {}) {
        const data = (0, viem_1.encodeFunctionData)({ abi: this.abi, functionName, args });
        const tx = { to: this.address, data, ...overrides };
        return tx;
    }
    // Create a transaction request using a custom ABI
    populateWithAbi(abi, functionName, args = [], overrides = {}) {
        const data = (0, viem_1.encodeFunctionData)({ abi, functionName, args });
        const tx = { to: this.address, data, ...overrides };
        return tx;
    }
    // Gets the chain ID
    async getChainId() {
        const provider = this.signer?.provider ?? this.signer;
        if (!provider || !provider.getNetwork) {
            throw new Error("Unable to get the chain ID: provider wasn't set");
        }
        const network = await provider.getNetwork();
        const chainId = network.chainId ?? BigInt(network.chainId);
        return chainId;
    }
}
exports.Base = Base;
//# sourceMappingURL=transaction.js.map