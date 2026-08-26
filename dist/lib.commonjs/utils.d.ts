export declare const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export declare const ZERO_BYTES = "0x";
export declare const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
export type WaitableTxResponse = {
    wait: (confirmations?: number) => Promise<unknown>;
};
