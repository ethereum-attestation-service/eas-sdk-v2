import { decodeFunctionResult, encodeFunctionData, type Abi } from 'viem';
import type { TransactionProvider } from '../transaction';

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

export const legacyVersion = async (contract: {
  getAddress: () => Promise<string> | string;
  runner?: { provider?: TransactionProvider };
}): Promise<string | undefined> => {
  const provider = contract.runner?.provider;
  if (!provider) {
    throw new Error("provider wasn't set");
  }

  const address =
    typeof contract.getAddress === 'function' ? await contract.getAddress() : (contract.getAddress as any);

  try {
    const data = encodeFunctionData({ abi: VERSION_ABI as unknown as Abi, functionName: 'VERSION' });
    const raw = await provider.call({ to: address, data });
    return decodeFunctionResult({
      abi: VERSION_ABI as unknown as Abi,
      functionName: 'VERSION',
      data: raw
    }) as unknown as string;
  } catch {
    return undefined;
  }
};
