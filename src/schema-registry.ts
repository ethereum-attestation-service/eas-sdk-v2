import SchemaRegistryArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json';
import { solidityPackedKeccak256 } from 'ethers';
import type { Abi } from 'viem';
import { legacyVersion } from './legacy/version';
import {
  Base,
  RequireSigner,
  Transaction,
  TransactionProvider,
  TransactionSigner,
  type TransactionReceipt
} from './transaction';
import { ZERO_ADDRESS, ZERO_BYTES32 } from './utils';

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
  signer?: TransactionSigner | TransactionProvider;
}

export class SchemaRegistry extends Base {
  constructor(address: string, options?: SchemaRegistryOptions) {
    const { signer } = options || {};

    super((SchemaRegistryArtifact as { abi: Abi }).abi as Abi, address, signer);
  }

  // Returns the version of the contract
  public async getVersion(): Promise<string> {
    return (
      (await legacyVersion({
        getAddress: async () => this.getAddress(),
        runner: { provider: this.getProvider() }
      } as any)) ?? (await this.read<string>('version'))
    );
  }

  // Returns a schema UID
  public static getSchemaUID(schema: string, resolverAddress: string, revocable: boolean) {
    return solidityPackedKeccak256(['string', 'address', 'bool'], [schema, resolverAddress, revocable]);
  }

  // Registers a new schema and returns its UID
  @RequireSigner
  public async register(
    { schema, resolverAddress = ZERO_ADDRESS, revocable = true }: RegisterSchemaParams,
    overrides?: Partial<Parameters<Transaction['estimateGas']>>[0]
  ): Promise<Transaction<string>> {
    const tx = this.populate('register', [schema, resolverAddress, revocable], overrides as any);
    return new Transaction(tx, this.signer!, async (_receipt: TransactionReceipt) =>
      SchemaRegistry.getSchemaUID(schema, resolverAddress, revocable)
    );
  }

  // Returns an existing schema by a schema UID
  public async getSchema({ uid }: GetSchemaParams): Promise<SchemaRecord> {
    const schema = await this.read<SchemaRecord>('getSchema', [uid]);
    if (schema.uid === ZERO_BYTES32) {
      throw new Error('Schema not found');
    }

    return schema;
  }
}
