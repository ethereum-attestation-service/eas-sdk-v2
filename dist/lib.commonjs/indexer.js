"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Indexer = void 0;
const tslib_1 = require("tslib");
const Indexer_json_1 = tslib_1.__importDefault(require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/Indexer.sol/Indexer.json"));
const eas_1 = require("./eas");
const version_1 = require("./legacy/version");
const transaction_1 = require("./transaction");
class Indexer extends transaction_1.Base {
    delegated;
    eas;
    constructor(address, options) {
        const { signer } = options || {};
        super(Indexer_json_1.default.abi, address, signer);
    }
    // Connects the API to a specific signer
    connect(signer) {
        delete this.delegated;
        delete this.eas;
        super.connect(signer);
        return this;
    }
    // Returns the version of the contract
    async getVersion() {
        return ((await (0, version_1.legacyVersion)({
            getAddress: () => this.getAddress(),
            runner: { provider: this.getProvider() }
        })) ??
            this.read('version'));
    }
    // Returns the address of the EAS contract
    getEASAddress() {
        return this.read('getEAS');
    }
    // Returns the EAS API
    async getEAS() {
        if (this.eas) {
            return this.eas;
        }
        return (this.eas = new eas_1.EAS(await this.getEASAddress(), { signer: this.signer }));
    }
    // Indexes an existing attestation
    // eslint-disable-next-line require-await
    async indexAttestation({ uid }, overrides) {
        const tx = this.populate('indexAttestation', [uid], overrides);
        return new transaction_1.Transaction(tx, this.signer, async () => { });
    }
    // Indexes multiple existing attestations
    // eslint-disable-next-line require-await
    async indexAttestations({ uids }, overrides) {
        const tx = this.populate('indexAttestations', [uids], overrides);
        return new transaction_1.Transaction(tx, this.signer, () => Promise.resolve(undefined));
    }
    isAttestationIndexed({ uid }) {
        return this.read('isAttestationIndexed', [uid]);
    }
    getReceivedAttestationUIDs({ recipient, schema, start, length, reverseOrder }) {
        return this.read('getReceivedAttestationUIDs', [recipient, schema, start, length, reverseOrder]);
    }
    getReceivedAttestationUIDCount({ recipient, schema }) {
        return this.read('getReceivedAttestationUIDCount', [recipient, schema]);
    }
    getSentAttestationUIDs({ attester, schema, start, length, reverseOrder }) {
        return this.read('getSentAttestationUIDs', [attester, schema, start, length, reverseOrder]);
    }
    getSentAttestationUIDCount({ attester, schema }) {
        return this.read('getSentAttestationUIDCount', [attester, schema]);
    }
    getSchemaAttesterRecipientAttestationUIDs({ schema, attester, recipient, start, length, reverseOrder }) {
        return this.read('getSchemaAttesterRecipientAttestationUIDs', [
            schema,
            attester,
            recipient,
            start,
            length,
            reverseOrder
        ]);
    }
    getSchemaAttesterRecipientAttestationUIDCount({ schema, attester, recipient }) {
        return this.read('getSchemaAttesterRecipientAttestationUIDCount', [schema, attester, recipient]);
    }
    getSchemaAttestationUIDs({ schema, start, length, reverseOrder }) {
        return this.read('getSchemaAttestationUIDs', [schema, start, length, reverseOrder]);
    }
    getSchemaAttestationUIDCount({ schema }) {
        return this.read('getSchemaAttestationUIDCount', [schema]);
    }
}
exports.Indexer = Indexer;
tslib_1.__decorate([
    transaction_1.RequireSigner,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], Indexer.prototype, "indexAttestation", null);
tslib_1.__decorate([
    transaction_1.RequireSigner,
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], Indexer.prototype, "indexAttestations", null);
//# sourceMappingURL=indexer.js.map