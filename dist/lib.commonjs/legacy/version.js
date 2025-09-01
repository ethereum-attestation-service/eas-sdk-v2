"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.legacyVersion = void 0;
const viem_1 = require("viem");
const VERSION_ABI = [
    {
        inputs: [],
        name: 'VERSION',
        outputs: [
            {
                internalType: 'string',
                name: '',
                type: 'string'
            }
        ],
        stateMutability: 'view',
        type: 'function'
    }
];
const legacyVersion = async (contract) => {
    const provider = contract.runner?.provider;
    if (!provider) {
        throw new Error("provider wasn't set");
    }
    const address = typeof contract.getAddress === 'function'
        ? await contract.getAddress()
        : contract.getAddress;
    try {
        const data = (0, viem_1.encodeFunctionData)({ abi: VERSION_ABI, functionName: 'VERSION' });
        const raw = await provider.call({ to: address, data });
        return (0, viem_1.decodeFunctionResult)({
            abi: VERSION_ABI,
            functionName: 'VERSION',
            data: raw
        });
    }
    catch {
        return undefined;
    }
};
exports.legacyVersion = legacyVersion;
//# sourceMappingURL=version.js.map