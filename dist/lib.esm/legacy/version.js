import { decodeFunctionResult, encodeFunctionData } from 'viem';
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
export const legacyVersion = async (contract) => {
    const provider = contract.runner?.provider;
    if (!provider) {
        throw new Error("provider wasn't set");
    }
    const address = typeof contract.getAddress === 'function'
        ? await contract.getAddress()
        : contract.getAddress;
    try {
        const data = encodeFunctionData({ abi: VERSION_ABI, functionName: 'VERSION' });
        const raw = await provider.call({ to: address, data });
        return decodeFunctionResult({
            abi: VERSION_ABI,
            functionName: 'VERSION',
            data: raw
        });
    }
    catch {
        return undefined;
    }
};
//# sourceMappingURL=version.js.map