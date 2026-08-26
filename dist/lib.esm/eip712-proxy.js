import { __decorate, __metadata } from "tslib";
import EIP712ProxyArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/eip712/proxy/EIP712Proxy.sol/EIP712Proxy.json';
import { EAS } from './eas.js';
import { legacyVersion } from './legacy/version.js';
import { DelegatedProxy } from './offchain/index.js';
import { NO_EXPIRATION } from './request.js';
import { Base, RequireSigner, Transaction } from './transaction.js';
import { ZERO_BYTES32 } from './utils.js';
export class EIP712Proxy extends Base {
    delegated;
    eas;
    constructor(address, options) {
        const { signer } = options || {};
        super(EIP712ProxyArtifact.abi, address, signer);
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
        return ((await legacyVersion({
            getAddress: () => this.getAddress(),
            runner: { provider: this.getProvider() }
        })) ??
            this.read('version'));
    }
    // Returns the EAS API
    async getEAS() {
        if (this.eas) {
            return this.eas;
        }
        return (this.eas = new EAS(await this.read('getEAS'), { signer: this.signer }));
    }
    // Returns the EIP712 name
    getName() {
        return this.read('getName');
    }
    // Returns the domain separator used in the encoding of the signatures for attest, and revoke
    getDomainSeparator() {
        return this.read('getDomainSeparator');
    }
    // Returns the EIP712 type hash for the attest function
    getAttestTypeHash() {
        return this.read('getAttestTypeHash');
    }
    // Returns the EIP712 type hash for the revoke function
    getRevokeTypeHash() {
        return this.read('getRevokeTypeHash');
    }
    // Returns the attester for a given uid
    getAttester(uid) {
        return this.read('getAttester', [uid]);
    }
    // Returns the delegated attestations helper
    getDelegated() {
        if (this.delegated) {
            return this.delegated;
        }
        return this.setDelegated();
    }
    // Attests to a specific schema via an EIP712 delegation request using an external EIP712 proxy
    // eslint-disable-next-line require-await
    async attestByDelegationProxy({ schema, data: { recipient, data, expirationTime = NO_EXPIRATION, revocable = true, refUID = ZERO_BYTES32, value = 0n }, attester, signature, deadline = NO_EXPIRATION }, overrides) {
        const tx = this.populate('attestByDelegation', [
            {
                schema,
                data: { recipient, expirationTime, revocable, refUID, data, value },
                signature,
                attester,
                deadline
            }
        ], { ...overrides, value });
        return new Transaction(tx, this.signer, async (receipt) => (await this.getEAS()).getUIDsFromAttestReceipt(receipt)[0]);
    }
    // Multi-attests to multiple schemas via an EIP712 delegation requests using an external EIP712 proxy
    // eslint-disable-next-line require-await
    async multiAttestByDelegationProxy(requests, overrides) {
        const multiAttestationRequests = requests.map((r) => ({
            schema: r.schema,
            data: r.data.map((d) => ({
                recipient: d.recipient,
                expirationTime: d.expirationTime ?? NO_EXPIRATION,
                revocable: d.revocable ?? true,
                refUID: d.refUID ?? ZERO_BYTES32,
                data: d.data ?? ZERO_BYTES32,
                value: d.value ?? 0n
            })),
            signatures: r.signatures,
            attester: r.attester,
            deadline: r.deadline ?? NO_EXPIRATION
        }));
        const requestedValue = multiAttestationRequests.reduce((res, { data }) => {
            const total = data.reduce((res, r) => res + r.value, 0n);
            return res + total;
        }, 0n);
        const tx = this.populate('multiAttestByDelegation', [multiAttestationRequests], {
            ...overrides,
            value: requestedValue
        });
        return new Transaction(tx, this.signer, async (receipt) => (await this.getEAS()).getUIDsFromAttestReceipt(receipt));
    }
    // Revokes an existing attestation an EIP712 delegation request using an external EIP712 proxy
    // eslint-disable-next-line require-await
    async revokeByDelegationProxy({ schema, data: { uid, value = 0n }, signature, revoker, deadline = NO_EXPIRATION }, overrides) {
        const tx = this.populate('revokeByDelegation', [
            {
                schema,
                data: { uid, value },
                signature,
                revoker,
                deadline
            }
        ], { ...overrides, value });
        return new Transaction(tx, this.signer, () => Promise.resolve(undefined));
    }
    // Multi-revokes multiple attestations via an EIP712 delegation requests using an external EIP712 proxy
    // eslint-disable-next-line require-await
    async multiRevokeByDelegationProxy(requests, overrides) {
        const multiRevocationRequests = requests.map((r) => ({
            schema: r.schema,
            data: r.data.map((d) => ({
                uid: d.uid,
                value: d.value ?? 0n
            })),
            signatures: r.signatures,
            revoker: r.revoker,
            deadline: r.deadline ?? NO_EXPIRATION
        }));
        const requestedValue = multiRevocationRequests.reduce((res, { data }) => {
            const total = data.reduce((res, r) => res + r.value, 0n);
            return res + total;
        }, 0n);
        const tx = this.populate('multiRevokeByDelegation', [multiRevocationRequests], {
            ...overrides,
            value: requestedValue
        });
        return new Transaction(tx, this.signer, async () => { });
    }
    // Sets the delegated attestations helper
    async setDelegated() {
        this.delegated = new DelegatedProxy({
            name: await this.getName(),
            address: this.getAddress(),
            version: await this.getVersion(),
            chainId: await this.getChainId()
        });
        return this.delegated;
    }
}
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EIP712Proxy.prototype, "attestByDelegationProxy", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EIP712Proxy.prototype, "multiAttestByDelegationProxy", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EIP712Proxy.prototype, "revokeByDelegationProxy", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EIP712Proxy.prototype, "multiRevokeByDelegationProxy", null);
//# sourceMappingURL=eip712-proxy.js.map