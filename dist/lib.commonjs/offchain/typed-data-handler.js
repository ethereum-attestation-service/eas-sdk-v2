"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedDataHandler = exports.InvalidAddress = exports.InvalidTypes = exports.InvalidPrimaryType = exports.InvalidDomain = exports.EIP712_DOMAIN = void 0;
const lodash_1 = require("lodash");
const viem_1 = require("viem");
const utils_1 = require("../utils");
exports.EIP712_DOMAIN = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
class InvalidDomain extends Error {
}
exports.InvalidDomain = InvalidDomain;
class InvalidPrimaryType extends Error {
}
exports.InvalidPrimaryType = InvalidPrimaryType;
class InvalidTypes extends Error {
}
exports.InvalidTypes = InvalidTypes;
class InvalidAddress extends Error {
}
exports.InvalidAddress = InvalidAddress;
class TypedDataHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    getDomainSeparator() {
        return TypedDataHandler.getDomainSeparator(this.config);
    }
    static getDomainSeparator(config) {
        return (0, viem_1.keccak256)((0, viem_1.encodeAbiParameters)([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }], [
            (0, viem_1.keccak256)((0, viem_1.stringToHex)(exports.EIP712_DOMAIN)),
            (0, viem_1.keccak256)((0, viem_1.stringToHex)(config.name)),
            (0, viem_1.keccak256)((0, viem_1.stringToHex)(config.version)),
            config.chainId,
            config.address
        ]));
    }
    getDomainTypedData() {
        return {
            name: this.config.name,
            version: this.config.version,
            chainId: this.config.chainId,
            verifyingContract: this.config.address
        };
    }
    async signTypedDataRequest(params, types, signer) {
        const rawSignature = await signer.signTypedData(types.domain, types.types, params);
        const sig = rawSignature.startsWith('0x') ? rawSignature.slice(2) : rawSignature;
        const r = `0x${sig.slice(0, 64)}`;
        const s = `0x${sig.slice(64, 128)}`;
        const v = parseInt(sig.slice(128, 130), 16);
        return { ...types, signature: { v, r, s } };
    }
    async verifyTypedDataRequestSignature(attester, response, types, strict = true) {
        // Normalize the chain ID
        const domain = { ...response.domain, chainId: BigInt(response.domain.chainId) };
        let expectedDomain = this.getDomainTypedData();
        if (!strict) {
            expectedDomain = { ...expectedDomain, version: domain.version };
        }
        if (!(0, lodash_1.isEqual)(domain, expectedDomain)) {
            throw new InvalidDomain();
        }
        if (response.primaryType !== types.primaryType) {
            throw new InvalidPrimaryType();
        }
        if (!(0, lodash_1.isEqual)(response.types, types.types)) {
            throw new InvalidTypes();
        }
        if (attester === utils_1.ZERO_ADDRESS) {
            throw new InvalidAddress();
        }
        // Derive effective primary type from the provided types when needed.
        // Some legacy payloads have a mismatch between primaryType and the key present in types (e.g. 'Attestation' vs 'Attest').
        const typeKeys = Object.keys(response.types);
        const inferredPrimaryType = (typeKeys.find((k) => k !== 'EIP712Domain') || response.primaryType);
        const effectivePrimaryType = response.types[response.primaryType]
            ? response.primaryType
            : inferredPrimaryType;
        const { signature } = response;
        const vByte = signature.v >= 27 ? signature.v : signature.v + 27;
        const vHex = `0x${vByte.toString(16).padStart(2, '0')}`;
        const serialized = (0, viem_1.concatHex)([signature.r, signature.s, vHex]);
        const hash = (0, viem_1.hashTypedData)({
            domain: {
                ...domain,
                verifyingContract: domain.verifyingContract
            },
            primaryType: effectivePrimaryType,
            types: response.types,
            message: response.message
        });
        const recoveredAddress = await (0, viem_1.recoverAddress)({ hash, signature: serialized });
        const normalizedAttester = (0, viem_1.getAddress)(attester);
        const normalizedRecovered = (0, viem_1.getAddress)(recoveredAddress);
        if (normalizedAttester === normalizedRecovered) {
            return true;
        }
        // Fallback: try alternate primary type mapping between 'Attest' and 'Attestation'
        let altPrimary;
        let altTypes;
        if (typeKeys.includes('Attest') && !typeKeys.includes('Attestation')) {
            altPrimary = 'Attestation';
            altTypes = {
                Attestation: response.types.Attest
            };
        }
        else if (typeKeys.includes('Attestation') && !typeKeys.includes('Attest')) {
            altPrimary = 'Attest';
            altTypes = {
                Attest: response.types.Attestation
            };
        }
        if (altPrimary && altTypes) {
            const altHash = (0, viem_1.hashTypedData)({
                domain: {
                    ...domain,
                    verifyingContract: domain.verifyingContract
                },
                primaryType: altPrimary,
                types: altTypes,
                message: response.message
            });
            const altRecovered = await (0, viem_1.recoverAddress)({ hash: altHash, signature: serialized });
            const altNormalized = (0, viem_1.getAddress)(altRecovered);
            return normalizedAttester === altNormalized;
        }
        // Last-resort: flip v parity and retry recovery
        const flippedV = ((vByte ^ 1) & 0xff); // 27<->28, 0<->1 then +27 applied above
        const flippedSerialized = (0, viem_1.concatHex)([
            signature.r,
            signature.s,
            `0x${flippedV.toString(16).padStart(2, '0')}`
        ]);
        const flippedRecovered = await (0, viem_1.recoverAddress)({ hash, signature: flippedSerialized });
        const flippedNormalized = (0, viem_1.getAddress)(flippedRecovered);
        if (normalizedAttester === flippedNormalized) {
            return true;
        }
        return false;
    }
}
exports.TypedDataHandler = TypedDataHandler;
//# sourceMappingURL=typed-data-handler.js.map