import type { TransactionProvider } from '../transaction';
export declare const legacyVersion: (contract: {
    getAddress: () => Promise<string> | string;
    runner?: {
        provider?: TransactionProvider;
    };
}) => Promise<string | undefined>;
