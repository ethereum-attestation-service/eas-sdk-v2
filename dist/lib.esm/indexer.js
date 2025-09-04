import { __decorate, __metadata } from "tslib";
import IndexerArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/Indexer.sol/Indexer.json';
import { legacyVersion } from './legacy/version.js';
import { Base, RequireSigner, Transaction } from './transaction.js';
export class Indexer extends Base {
    delegated;
    constructor(address, options) {
        const { signer } = options || {};
        super(IndexerArtifact.abi, address, signer);
    }
    // Connects the API to a specific signer
    connect(signer) {
        delete this.delegated;
        super.connect(signer);
        return this;
    }
    // Returns the version of the contract
    async getVersion() {
        return ((await legacyVersion({
            getAddress: () => this.getAddress(),
            runner: { provider: this.getProvider() }
        })) ??
            this.read('version'));
    }
    // Returns the address of the EAS contract
    getEAS() {
        return this.read('getEAS');
    }
    // Indexes an existing attestation
    // eslint-disable-next-line require-await
    async indexAttestation({ uid }, overrides) {
        const tx = this.populate('indexAttestation', [uid], overrides);
        return new Transaction(tx, this.signer, async () => { });
    }
    // Indexes multiple existing attestations
    // eslint-disable-next-line require-await
    async indexAttestations({ uids }, overrides) {
        const tx = this.populate('indexAttestations', [uids], overrides);
        return new Transaction(tx, this.signer, () => Promise.resolve(undefined));
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
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], Indexer.prototype, "indexAttestation", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], Indexer.prototype, "indexAttestations", null);
//# sourceMappingURL=indexer.js.map