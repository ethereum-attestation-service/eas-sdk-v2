import { __decorate, __metadata } from "tslib";
import SchemaRegistryArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json';
import { encodePacked, keccak256 } from 'viem';
import { legacyVersion } from './legacy/version.js';
import { Base, RequireSigner, Transaction } from './transaction.js';
import { ZERO_ADDRESS, ZERO_BYTES32 } from './utils.js';
export class SchemaRegistry extends Base {
    constructor(address, options) {
        const { signer } = options || {};
        super(SchemaRegistryArtifact.abi, address, signer);
    }
    // Returns the version of the contract
    async getVersion() {
        return ((await legacyVersion({
            getAddress: () => this.getAddress(),
            runner: { provider: this.getProvider() }
        })) ??
            this.read('version'));
    }
    // Returns a schema UID
    static getSchemaUID(schema, resolverAddress, revocable) {
        return keccak256(encodePacked(['string', 'address', 'bool'], [schema, resolverAddress, revocable]));
    }
    // Registers a new schema and returns its UID
    // eslint-disable-next-line require-await
    async register({ schema, resolverAddress = ZERO_ADDRESS, revocable = true }, overrides) {
        const tx = this.populate('register', [schema, resolverAddress, revocable], overrides);
        return new Transaction(tx, this.signer, (_receipt) => Promise.resolve(SchemaRegistry.getSchemaUID(schema, resolverAddress, revocable)));
    }
    // Returns an existing schema by a schema UID
    async getSchema({ uid }) {
        const schema = await this.read('getSchema', [uid]);
        if (schema.uid === ZERO_BYTES32) {
            throw new Error('Schema not found');
        }
        return schema;
    }
}
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SchemaRegistry.prototype, "register", null);
//# sourceMappingURL=schema-registry.js.map