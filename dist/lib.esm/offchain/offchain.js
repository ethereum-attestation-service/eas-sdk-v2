import { bytesToHex, encodeAbiParameters, encodePacked, keccak256, stringToHex, toBytes } from 'viem';
import { ZERO_ADDRESS, ZERO_BYTES32 } from '../utils.js';
import { InvalidPrimaryType, InvalidTypes, TypedDataHandler } from './typed-data-handler.js';
import { EIP712_NAME } from './versions.js';
export var OffchainAttestationVersion;
(function (OffchainAttestationVersion) {
    OffchainAttestationVersion[OffchainAttestationVersion["Legacy"] = 0] = "Legacy";
    OffchainAttestationVersion[OffchainAttestationVersion["Version1"] = 1] = "Version1";
    OffchainAttestationVersion[OffchainAttestationVersion["Version2"] = 2] = "Version2";
})(OffchainAttestationVersion || (OffchainAttestationVersion = {}));
export const OFFCHAIN_ATTESTATION_TYPES = {
    [OffchainAttestationVersion.Legacy]: [
        {
            domain: 'EAS Attestation',
            primaryType: 'Attestation',
            types: {
                Attestation: [
                    { name: 'schema', type: 'bytes32' },
                    { name: 'recipient', type: 'address' },
                    { name: 'time', type: 'uint64' },
                    { name: 'expirationTime', type: 'uint64' },
                    { name: 'revocable', type: 'bool' },
                    { name: 'refUID', type: 'bytes32' },
                    { name: 'data', type: 'bytes' }
                ]
            }
        },
        {
            domain: 'EAS Attestation',
            primaryType: 'Attestation',
            types: {
                Attest: [
                    { name: 'schema', type: 'bytes32' },
                    { name: 'recipient', type: 'address' },
                    { name: 'time', type: 'uint64' },
                    { name: 'expirationTime', type: 'uint64' },
                    { name: 'revocable', type: 'bool' },
                    { name: 'refUID', type: 'bytes32' },
                    { name: 'data', type: 'bytes' }
                ]
            }
        },
        {
            domain: 'EAS Attestation',
            primaryType: 'Attest',
            types: {
                Attest: [
                    { name: 'schema', type: 'bytes32' },
                    { name: 'recipient', type: 'address' },
                    { name: 'time', type: 'uint64' },
                    { name: 'expirationTime', type: 'uint64' },
                    { name: 'revocable', type: 'bool' },
                    { name: 'refUID', type: 'bytes32' },
                    { name: 'data', type: 'bytes' }
                ]
            }
        }
    ],
    [OffchainAttestationVersion.Version1]: [
        {
            domain: 'EAS Attestation',
            primaryType: 'Attest',
            types: {
                Attest: [
                    { name: 'version', type: 'uint16' },
                    { name: 'schema', type: 'bytes32' },
                    { name: 'recipient', type: 'address' },
                    { name: 'time', type: 'uint64' },
                    { name: 'expirationTime', type: 'uint64' },
                    { name: 'revocable', type: 'bool' },
                    { name: 'refUID', type: 'bytes32' },
                    { name: 'data', type: 'bytes' }
                ]
            }
        }
    ],
    [OffchainAttestationVersion.Version2]: [
        {
            domain: 'EAS Attestation',
            primaryType: 'Attest',
            types: {
                Attest: [
                    { name: 'version', type: 'uint16' },
                    { name: 'schema', type: 'bytes32' },
                    { name: 'recipient', type: 'address' },
                    { name: 'time', type: 'uint64' },
                    { name: 'expirationTime', type: 'uint64' },
                    { name: 'revocable', type: 'bool' },
                    { name: 'refUID', type: 'bytes32' },
                    { name: 'data', type: 'bytes' },
                    { name: 'salt', type: 'bytes32' }
                ]
            }
        }
    ]
};
const DEFAULT_OFFCHAIN_ATTESTATION_OPTIONS = {
    verifyOnchain: false
};
export const SALT_SIZE = 32;
export class Offchain extends TypedDataHandler {
    version;
    signingType;
    verificationTypes;
    eas;
    constructor(config, version, eas) {
        if (version > OffchainAttestationVersion.Version2) {
            throw new Error('Unsupported version');
        }
        super({ ...config, name: EIP712_NAME });
        this.version = version;
        this.verificationTypes = OFFCHAIN_ATTESTATION_TYPES[this.version];
        this.signingType = this.verificationTypes[0];
        this.eas = eas;
    }
    getDomainSeparator() {
        return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }], [
            keccak256(stringToHex(this.signingType.domain, { size: 32 })),
            keccak256(stringToHex(this.config.version, { size: 32 })),
            this.config.chainId,
            this.config.address
        ]));
    }
    getDomainTypedData() {
        return {
            name: this.signingType.domain,
            version: this.config.version,
            chainId: this.config.chainId,
            verifyingContract: this.config.address
        };
    }
    async signOffchainAttestation(params, signer, options) {
        const typedData = { version: this.version, ...params };
        // If no salt was provided - generate a random salt.
        if (this.version >= OffchainAttestationVersion.Version2 && !typedData.salt) {
            const rand = new Uint8Array(SALT_SIZE);
            crypto.getRandomValues(rand);
            typedData.salt = bytesToHex(rand);
        }
        const signedRequest = await this.signTypedDataRequest(typedData, {
            domain: this.getDomainTypedData(),
            primaryType: this.signingType.primaryType,
            message: typedData,
            types: this.signingType.types
        }, signer);
        const { verifyOnchain } = { ...DEFAULT_OFFCHAIN_ATTESTATION_OPTIONS, ...options };
        if (verifyOnchain) {
            try {
                const { schema, recipient, expirationTime, revocable, data } = params;
                // Verify the offchain attestation onchain by simulating a contract call to attest. Since onchain verification
                // makes sure that any referenced attestations exist, we will set refUID to ZERO_BYTES32.
                // Simulate onchain attest call (read-only) using EAS helper
                await this.eas.simulateAttest({
                    schema,
                    data: { recipient, expirationTime, revocable, refUID: params.refUID || ZERO_BYTES32, data, value: 0 }
                }, undefined);
            }
            catch (e) {
                throw new Error(`Unable to verify offchain attestation with: ${e}`);
            }
        }
        return {
            version: this.version,
            uid: this.getOffchainUID(typedData),
            ...signedRequest
        };
    }
    async verifyOffchainAttestationSignature(attester, attestation) {
        const typeCount = this.verificationTypes.length;
        const asyncSome = async (arr, cb) => {
            for (let i = 0; i < arr.length; i++) {
                if (await cb(arr[i], i)) {
                    return true;
                }
            }
            return false;
        };
        const result = await asyncSome(this.verificationTypes, async (type, index) => {
            try {
                return await this.verifyTypedDataRequestSignature(attester, attestation, {
                    primaryType: type.primaryType,
                    types: type.types
                }, false);
            }
            catch (e) {
                if (index !== typeCount - 1 && (e instanceof InvalidPrimaryType || e instanceof InvalidTypes)) {
                    return false;
                }
                throw e;
            }
        });
        if (result) {
            return true;
        }
        // Fallback: verify using the embedded types in the payload as-is
        try {
            return await this.verifyTypedDataRequestSignature(attester, attestation, { primaryType: attestation.primaryType, types: attestation.types }, false);
        }
        catch (_e) {
            return false;
        }
    }
    getOffchainUID(params) {
        return Offchain.getOffchainUID(this.version, params.schema, params.recipient, params.time, params.expirationTime, params.revocable, params.refUID, params.data, params.salt);
    }
    static getOffchainUID(version, schema, recipient, time, expirationTime, revocable, refUID, data, salt) {
        switch (version) {
            case OffchainAttestationVersion.Legacy:
                return keccak256(encodePacked(['bytes32', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'], [
                    schema,
                    recipient,
                    ZERO_ADDRESS,
                    time,
                    expirationTime,
                    revocable,
                    refUID,
                    data,
                    0
                ]));
            case OffchainAttestationVersion.Version1:
                return keccak256(encodePacked(['uint16', 'bytes32', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'], [
                    version,
                    schema,
                    recipient,
                    ZERO_ADDRESS,
                    time,
                    expirationTime,
                    revocable,
                    refUID,
                    data,
                    0
                ]));
            case OffchainAttestationVersion.Version2:
                return keccak256(encodePacked([
                    'uint16',
                    'bytes32',
                    'address',
                    'address',
                    'uint64',
                    'uint64',
                    'bool',
                    'bytes32',
                    'bytes',
                    'bytes32',
                    'uint32'
                ], [
                    version,
                    schema,
                    recipient,
                    ZERO_ADDRESS,
                    time,
                    expirationTime,
                    revocable,
                    refUID,
                    data,
                    salt,
                    0
                ]));
            default:
                throw new Error('Unsupported version');
        }
    }
    // Compatibility helper for older encodings where schema was treated as bytes instead of bytes32
    static getOffchainUidLegacySchema(version, schema, recipient, time, expirationTime, revocable, refUID, data, salt) {
        switch (version) {
            case OffchainAttestationVersion.Legacy:
                return keccak256(encodePacked(['bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'], [
                    bytesToHex(toBytes(schema)),
                    recipient,
                    ZERO_ADDRESS,
                    time,
                    expirationTime,
                    revocable,
                    refUID,
                    data,
                    0
                ]));
            case OffchainAttestationVersion.Version1:
                return keccak256(encodePacked(['uint16', 'bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'], [
                    version,
                    bytesToHex(toBytes(schema)),
                    recipient,
                    ZERO_ADDRESS,
                    time,
                    expirationTime,
                    revocable,
                    refUID,
                    data,
                    0
                ]));
            case OffchainAttestationVersion.Version2:
                return keccak256(encodePacked([
                    'uint16',
                    'bytes',
                    'address',
                    'address',
                    'uint64',
                    'uint64',
                    'bool',
                    'bytes32',
                    'bytes',
                    'bytes32',
                    'uint32'
                ], [
                    version,
                    bytesToHex(toBytes(schema)),
                    recipient,
                    ZERO_ADDRESS,
                    time,
                    expirationTime,
                    revocable,
                    refUID,
                    data,
                    salt,
                    0
                ]));
            default:
                throw new Error('Unsupported version');
        }
    }
}
//# sourceMappingURL=offchain.js.map