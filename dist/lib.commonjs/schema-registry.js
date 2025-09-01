"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaRegistry = void 0;
const tslib_1 = require("tslib");
const SchemaRegistry_json_1 = tslib_1.__importDefault(require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json"));
const viem_1 = require("viem");
const version_1 = require("./legacy/version");
const transaction_1 = require("./transaction");
const utils_1 = require("./utils");
class SchemaRegistry extends transaction_1.Base {
    constructor(address, options) {
        const { signer } = options || {};
        super(SchemaRegistry_json_1.default.abi, address, signer);
    }
    // Returns the version of the contract
    async getVersion() {
        return ((await (0, version_1.legacyVersion)({
            getAddress: () => this.getAddress(),
            runner: { provider: this.getProvider() }
        })) ??
            this.read('version'));
    }
    // Returns a schema UID
    static getSchemaUID(schema, resolverAddress, revocable) {
        return (0, viem_1.keccak256)((0, viem_1.encodePacked)(['string', 'address', 'bool'], [schema, resolverAddress, revocable]));
    }
    // Registers a new schema and returns its UID
    // eslint-disable-next-line require-await
    async register({ schema, resolverAddress = utils_1.ZERO_ADDRESS, revocable = true }, overrides) {
        const tx = this.populate('register', [schema, resolverAddress, revocable], overrides);
        return new transaction_1.Transaction(tx, this.signer, (_receipt) => Promise.resolve(SchemaRegistry.getSchemaUID(schema, resolverAddress, revocable)));
    }
    // Returns an existing schema by a schema UID
    async getSchema({ uid }) {
        const schema = await this.read('getSchema', [uid]);
        if (schema.uid === utils_1.ZERO_BYTES32) {
            throw new Error('Schema not found');
        }
        return schema;
    }
}
exports.SchemaRegistry = SchemaRegistry;
tslib_1.__decorate([
    transaction_1.RequireSigner,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], SchemaRegistry.prototype, "register", null);
//# sourceMappingURL=schema-registry.js.map