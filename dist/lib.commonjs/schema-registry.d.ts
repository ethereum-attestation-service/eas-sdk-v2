import { Base, Transaction, type SignerOrProvider, type TransactionOverrides } from './transaction';
export declare type SchemaRecord = {
    uid: string;
    resolver: string;
    revocable: boolean;
    schema: string;
};
export interface RegisterSchemaParams {
    schema: string;
    resolverAddress?: string;
    revocable?: boolean;
}
export interface GetSchemaParams {
    uid: string;
}
export interface SchemaRegistryOptions {
    signer?: SignerOrProvider;
}
export declare class SchemaRegistry extends Base {
    constructor(address: string, options?: SchemaRegistryOptions);
    getVersion(): Promise<string>;
    static getSchemaUID(schema: string, resolverAddress: string, revocable: boolean): `0x${string}`;
    register({ schema, resolverAddress, revocable }: RegisterSchemaParams, overrides?: TransactionOverrides): Promise<Transaction<string>>;
    getSchema({ uid }: GetSchemaParams): Promise<SchemaRecord>;
}
