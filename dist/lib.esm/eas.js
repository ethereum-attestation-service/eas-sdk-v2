import { __decorate, __metadata } from "tslib";
import EASLegacyArtifact from '@ethereum-attestation-service/eas-contracts-legacy/artifacts/contracts/EAS.sol/EAS.json';
import EASArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json';
import semver from 'semver';
import { decodeEventLog, encodePacked, keccak256, stringToHex } from 'viem';
import { legacyVersion } from './legacy/version';
import { Delegated, Offchain, OffchainAttestationVersion } from './offchain';
import { NO_EXPIRATION } from './request';
import { Base, RequireSigner, Transaction } from './transaction';
import { ZERO_ADDRESS, ZERO_BYTES32 } from './utils';
const LEGACY_VERSION = '1.1.0';
var Event;
(function (Event) {
    Event["Attested"] = "Attested";
    Event["Timestamped"] = "Timestamped";
    Event["RevokedOffchain"] = "RevokedOffchain";
})(Event || (Event = {}));
const TOPICS = {
    [Event.Attested]: keccak256(stringToHex('Attested(address,address,bytes32,bytes32)')),
    [Event.Timestamped]: keccak256(stringToHex('Timestamped(bytes32,uint64)')),
    [Event.RevokedOffchain]: keccak256(stringToHex('RevokedOffchain(address,bytes32,uint64)'))
};
export * from './request';
export function RequireProxy(...args) {
    // Standard decorator: (value, context)
    if (args.length === 2) {
        const [value] = args;
        const wrapped = function (...fnArgs) {
            if (!this.proxy) {
                throw new Error('Invalid proxy');
            }
            return value.apply(this, fnArgs);
        };
        return wrapped;
    }
    // Legacy decorator: (target, propertyKey, descriptor)
    const [_target, _propertyKey, descriptor] = args;
    const original = descriptor.value;
    descriptor.value = function (...fnArgs) {
        if (!this.proxy) {
            throw new Error('Invalid proxy');
        }
        return original.apply(this, fnArgs);
    };
    return descriptor;
}
export class EAS extends Base {
    proxy;
    delegated;
    offchain;
    version;
    legacyAbi;
    constructor(address, options) {
        const { signer, proxy } = options || {};
        super(EASArtifact.abi, address, signer);
        this.legacyAbi = EASLegacyArtifact.abi;
        if (proxy) {
            this.proxy = proxy;
        }
    }
    // Connects the API to a specific signer
    connect(signer) {
        delete this.delegated;
        delete this.offchain;
        super.connect(signer);
        return this;
    }
    // Returns the version of the contract
    async getVersion() {
        if (this.version) {
            return this.version;
        }
        return (this.version =
            (await legacyVersion({
                getAddress: () => this.getAddress(),
                runner: { provider: this.getProvider() }
            })) ??
                (await this.read('version')));
    }
    // Returns an existing schema by attestation UID
    getAttestation(uid) {
        return this.read('getAttestation', [uid]);
    }
    // Returns whether an attestation is valid
    isAttestationValid(uid) {
        return this.read('isAttestationValid', [uid]);
    }
    // Returns whether an attestation has been revoked
    async isAttestationRevoked(uid) {
        const attestation = await this.read('getAttestation', [uid]);
        if (attestation.uid === ZERO_BYTES32) {
            throw new Error('Invalid attestation');
        }
        return attestation.revocationTime != NO_EXPIRATION;
    }
    // Returns the timestamp that the specified data was timestamped with
    getTimestamp(data) {
        return this.read('getTimestamp', [data]);
    }
    // Returns the timestamp that the specified data was timestamped with
    getRevocationOffchain(user, uid) {
        return this.read('getRevokeOffchain', [user, uid]);
    }
    // Returns the EIP712 proxy
    getEIP712Proxy() {
        return this.proxy;
    }
    // Returns the delegated attestations helper
    getDelegated() {
        if (this.delegated) {
            return this.delegated;
        }
        return this.setDelegated();
    }
    // Returns the offchain attestations helper
    getOffchain() {
        if (this.offchain) {
            return this.offchain;
        }
        return this.setOffchain();
    }
    // Attests to a specific schema
    // eslint-disable-next-line require-await
    async attest({ schema, data: { recipient = ZERO_ADDRESS, data, expirationTime = NO_EXPIRATION, revocable = true, refUID = ZERO_BYTES32, value = 0n } }, overrides) {
        const tx = this.populate('attest', [{ schema, data: { recipient, expirationTime, revocable, refUID, data, value } }], {
            ...overrides,
            value
        });
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getUIDsFromAttestReceipt(receipt)[0]));
    }
    // Attests to a specific schema via an EIP712 delegation request
    async attestByDelegation({ schema, data: { recipient = ZERO_ADDRESS, data, expirationTime = NO_EXPIRATION, revocable = true, refUID = ZERO_BYTES32, value = 0n }, signature, attester, deadline = NO_EXPIRATION }, overrides) {
        const isLegacy = await this.isLegacyContract();
        /* eslint-disable indent */
        const args = isLegacy
            ? [{ schema, data: { recipient, expirationTime, revocable, refUID, data, value }, signature, attester }]
            : [
                {
                    schema,
                    data: { recipient, expirationTime, revocable, refUID, data, value },
                    signature,
                    attester,
                    deadline
                }
            ];
        /* eslint-enable indent */
        const tx = isLegacy
            ? this.populateWithAbi(this.legacyAbi, 'attestByDelegation', args, { ...overrides, value })
            : this.populate('attestByDelegation', args, { ...overrides, value });
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getUIDsFromAttestReceipt(receipt)[0]));
    }
    // Multi-attests to multiple schemas
    // eslint-disable-next-line require-await
    async multiAttest(requests, overrides) {
        const multiAttestationRequests = requests.map((r) => ({
            schema: r.schema,
            data: r.data.map((d) => ({
                recipient: d.recipient ?? ZERO_ADDRESS,
                expirationTime: d.expirationTime ?? NO_EXPIRATION,
                revocable: d.revocable ?? true,
                refUID: d.refUID ?? ZERO_BYTES32,
                data: d.data ?? ZERO_BYTES32,
                value: d.value ?? 0n
            }))
        }));
        const requestedValue = multiAttestationRequests.reduce((res, { data }) => {
            const total = data.reduce((res, r) => res + r.value, 0n);
            return res + total;
        }, 0n);
        const tx = this.populate('multiAttest', [multiAttestationRequests], {
            ...overrides,
            value: requestedValue
        });
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getUIDsFromAttestReceipt(receipt)));
    }
    // Multi-attests to multiple schemas via an EIP712 delegation requests
    async multiAttestByDelegation(requests, overrides) {
        const isLegacy = await this.isLegacyContract();
        const multiAttestationRequests = requests.map((r) => ({
            schema: r.schema,
            data: r.data.map((d) => ({
                recipient: d.recipient ?? ZERO_ADDRESS,
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
        const args = [multiAttestationRequests];
        /* eslint-disable indent */
        const tx = isLegacy
            ? this.populateWithAbi(this.legacyAbi, 'multiAttestByDelegation', args, {
                ...overrides,
                value: requestedValue
            })
            : this.populate('multiAttestByDelegation', args, { ...overrides, value: requestedValue });
        /* eslint-enable indent */
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getUIDsFromAttestReceipt(receipt)));
    }
    // Revokes an existing attestation
    // eslint-disable-next-line require-await
    async revoke({ schema, data: { uid, value = 0n } }, overrides) {
        const tx = this.populate('revoke', [{ schema, data: { uid, value } }], {
            ...overrides,
            value
        });
        return new Transaction(tx, this.signer, async () => { });
    }
    // Revokes an existing attestation an EIP712 delegation request
    async revokeByDelegation({ schema, data: { uid, value = 0n }, signature, revoker, deadline = NO_EXPIRATION }, overrides) {
        const isLegacy = await this.isLegacyContract();
        const args = isLegacy
            ? [{ schema, data: { uid, value }, signature, revoker }]
            : [{ schema, data: { uid, value }, signature, revoker, deadline }];
        const tx = isLegacy
            ? this.populateWithAbi(this.legacyAbi, 'revokeByDelegation', args, { ...overrides, value })
            : this.populate('revokeByDelegation', args, { ...overrides, value });
        return new Transaction(tx, this.signer, async () => { });
    }
    // Multi-revokes multiple attestations
    // eslint-disable-next-line require-await
    async multiRevoke(requests, overrides) {
        const multiRevocationRequests = requests.map((r) => ({
            schema: r.schema,
            data: r.data.map((d) => ({
                uid: d.uid,
                value: d.value ?? 0n
            }))
        }));
        const requestedValue = multiRevocationRequests.reduce((res, { data }) => {
            const total = data.reduce((res, r) => res + r.value, 0n);
            return res + total;
        }, 0n);
        const tx = this.populate('multiRevoke', [multiRevocationRequests], {
            ...overrides,
            value: requestedValue
        });
        return new Transaction(tx, this.signer, () => Promise.resolve(undefined));
    }
    // Multi-revokes multiple attestations via an EIP712 delegation requests
    async multiRevokeByDelegation(requests, overrides) {
        const isLegacy = await this.isLegacyContract();
        const multiRevocationRequests = requests.map((r) => ({
            schema: r.schema,
            data: r.data.map((d) => ({ uid: d.uid, value: d.value ?? 0n })),
            signatures: r.signatures,
            revoker: r.revoker,
            deadline: r.deadline ?? NO_EXPIRATION
        }));
        const requestedValue = multiRevocationRequests.reduce((res, { data }) => {
            const total = data.reduce((res, r) => res + r.value, 0n);
            return res + total;
        }, 0n);
        const args = [multiRevocationRequests];
        /* eslint-disable indent */
        const tx = isLegacy
            ? this.populateWithAbi(this.legacyAbi, 'multiRevokeByDelegation', args, {
                ...overrides,
                value: requestedValue
            })
            : this.populate('multiRevokeByDelegation', args, { ...overrides, value: requestedValue });
        /* eslint-enable indent */
        return new Transaction(tx, this.signer, async () => { });
    }
    // Attests to a specific schema via an EIP712 delegation request using an external EIP712 proxy
    attestByDelegationProxy(request, overrides) {
        return this.proxy.attestByDelegationProxy(request, overrides);
    }
    // Multi-attests to multiple schemas via an EIP712 delegation requests using an external EIP712 proxy
    multiAttestByDelegationProxy(requests, overrides) {
        return this.proxy.multiAttestByDelegationProxy(requests, overrides);
    }
    // Revokes an existing attestation an EIP712 delegation request using an external EIP712 proxy
    revokeByDelegationProxy(request, overrides) {
        return this.proxy.revokeByDelegationProxy(request, overrides);
    }
    // Multi-revokes multiple attestations via an EIP712 delegation requests using an external EIP712 proxy
    multiRevokeByDelegationProxy(requests, overrides) {
        return this.proxy.multiRevokeByDelegationProxy(requests, overrides);
    }
    // Timestamps the specified bytes32 data
    // eslint-disable-next-line require-await
    async timestamp(data, overrides) {
        const tx = this.populate('timestamp', [data], overrides);
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getTimestampFromTimestampReceipt(receipt)[0]));
    }
    // Timestamps the specified multiple bytes32 data
    // eslint-disable-next-line require-await
    async multiTimestamp(data, overrides) {
        const tx = this.populate('multiTimestamp', [data], overrides);
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getTimestampFromTimestampReceipt(receipt)));
    }
    // Revokes the specified offchain attestation UID
    // eslint-disable-next-line require-await
    async revokeOffchain(uid, overrides) {
        const tx = this.populate('revokeOffchain', [uid], overrides);
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getTimestampFromOffchainRevocationReceipt(receipt)[0]));
    }
    // Revokes the specified multiple offchain attestation UIDs
    // eslint-disable-next-line require-await
    async multiRevokeOffchain(uids, overrides) {
        const tx = this.populate('multiRevokeOffchain', [uids], overrides);
        return new Transaction(tx, this.signer, (receipt) => Promise.resolve(this.getTimestampFromOffchainRevocationReceipt(receipt)));
    }
    // Returns the domain separator used in the encoding of the signatures for attest, and revoke
    getDomainSeparator() {
        return this.read('getDomainSeparator');
    }
    // Returns the current nonce per-account.
    getNonce(address) {
        return this.read('getNonce', [address]);
    }
    // Returns the EIP712 type hash for the attest function
    getAttestTypeHash() {
        return this.read('getAttestTypeHash');
    }
    // Returns the EIP712 type hash for the revoke function
    getRevokeTypeHash() {
        return this.read('getRevokeTypeHash');
    }
    // Return attestation UID
    static getAttestationUID = (schema, recipient, attester, time, expirationTime, revocable, refUID, data, bump) => keccak256(encodePacked(['bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'], [
        stringToHex(schema),
        recipient,
        attester,
        time,
        expirationTime,
        revocable,
        refUID,
        data,
        bump
    ]));
    async getUIDFromAttestTx(res) {
        return (await this.getUIDsFromMultiAttestTx(res))[0];
    }
    async getUIDsFromMultiAttestTx(res) {
        const tx = await res;
        const receipt = (await tx.wait());
        if (!receipt) {
            throw new Error(`Unable to confirm: ${tx}`);
        }
        return this.getUIDsFromAttestReceipt(receipt);
    }
    getUIDsFromAttestReceipt(receipt) {
        return this.getDataFromReceipt(receipt, Event.Attested, 'uid');
    }
    getTimestampFromTimestampReceipt(receipt) {
        return this.getDataFromReceipt(receipt, Event.Timestamped, 'timestamp').map((s) => BigInt(s));
    }
    getTimestampFromOffchainRevocationReceipt(receipt) {
        return this.getDataFromReceipt(receipt, Event.RevokedOffchain, 'timestamp').map((s) => BigInt(s));
    }
    // Simulate an attest call (read-only) for validation purposes
    async simulateAttest(input, from) {
        await this.read('attest', [input], from ? { from } : {});
    }
    // Sets the delegated attestations helper
    async setDelegated() {
        this.delegated = new Delegated({
            address: this.getAddress(),
            domainSeparator: await this.getDomainSeparator(),
            chainId: await this.getChainId()
        }, this);
        return this.delegated;
    }
    // Sets the offchain attestations helper
    async setOffchain() {
        this.offchain = new Offchain({
            address: this.getAddress(),
            version: await this.getVersion(),
            chainId: await this.getChainId()
        }, OffchainAttestationVersion.Version2, this);
        return this.offchain;
    }
    async isLegacyContract() {
        const version = await this.getVersion();
        const fullVersion = semver.coerce(version);
        if (!fullVersion) {
            throw new Error(`Invalid version: ${version}`);
        }
        return semver.lte(fullVersion, LEGACY_VERSION);
    }
    getDataFromReceipt(receipt, event, attribute) {
        const abi = EASArtifact.abi;
        const easAddress = this.getAddress();
        const logs = receipt.logs.filter((l) => l.topics[0] === TOPICS[event] && l.address.toLowerCase() === easAddress.toLowerCase());
        if (logs.length === 0) {
            throw new Error(`Unable to process ${event} events`);
        }
        return logs.map((log) => {
            const decoded = decodeEventLog({
                abi,
                topics: log.topics,
                data: log.data
            });
            return decoded.args[attribute];
        });
    }
}
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "attest", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "attestByDelegation", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiAttest", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiAttestByDelegation", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "revoke", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "revokeByDelegation", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiRevoke", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiRevokeByDelegation", null);
__decorate([
    RequireSigner,
    RequireProxy,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "attestByDelegationProxy", null);
__decorate([
    RequireSigner,
    RequireProxy,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiAttestByDelegationProxy", null);
__decorate([
    RequireSigner,
    RequireProxy,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "revokeByDelegationProxy", null);
__decorate([
    RequireSigner,
    RequireProxy,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiRevokeByDelegationProxy", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "timestamp", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiTimestamp", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "revokeOffchain", null);
__decorate([
    RequireSigner,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], EAS.prototype, "multiRevokeOffchain", null);
//# sourceMappingURL=eas.js.map