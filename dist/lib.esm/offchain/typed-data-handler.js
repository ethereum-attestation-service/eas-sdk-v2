import isEqual from 'lodash/isEqual';
import { concatHex, encodeAbiParameters, getAddress, hashTypedData, keccak256, recoverAddress, stringToHex } from 'viem';
import { ZERO_ADDRESS } from '../utils.js';
export const EIP712_DOMAIN = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
export class InvalidDomain extends Error {
}
export class InvalidPrimaryType extends Error {
}
export class InvalidTypes extends Error {
}
export class InvalidAddress extends Error {
}
export class TypedDataHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    getDomainSeparator() {
        return TypedDataHandler.getDomainSeparator(this.config);
    }
    static getDomainSeparator(config) {
        return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }], [
            keccak256(stringToHex(EIP712_DOMAIN)),
            keccak256(stringToHex(config.name)),
            keccak256(stringToHex(config.version)),
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
        if (!isEqual(domain, expectedDomain)) {
            throw new InvalidDomain();
        }
        if (response.primaryType !== types.primaryType) {
            throw new InvalidPrimaryType();
        }
        if (!isEqual(response.types, types.types)) {
            throw new InvalidTypes();
        }
        if (attester === ZERO_ADDRESS) {
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
        const serialized = concatHex([signature.r, signature.s, vHex]);
        const hash = hashTypedData({
            domain: {
                ...domain,
                verifyingContract: domain.verifyingContract
            },
            primaryType: effectivePrimaryType,
            types: response.types,
            message: response.message
        });
        const recoveredAddress = await recoverAddress({ hash, signature: serialized });
        const normalizedAttester = getAddress(attester);
        const normalizedRecovered = getAddress(recoveredAddress);
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
            const altHash = hashTypedData({
                domain: {
                    ...domain,
                    verifyingContract: domain.verifyingContract
                },
                primaryType: altPrimary,
                types: altTypes,
                message: response.message
            });
            const altRecovered = await recoverAddress({ hash: altHash, signature: serialized });
            const altNormalized = getAddress(altRecovered);
            return normalizedAttester === altNormalized;
        }
        // Last-resort: flip v parity and retry recovery
        const flippedV = ((vByte ^ 1) & 0xff); // 27<->28, 0<->1 then +27 applied above
        const flippedSerialized = concatHex([
            signature.r,
            signature.s,
            `0x${flippedV.toString(16).padStart(2, '0')}`
        ]);
        const flippedRecovered = await recoverAddress({ hash, signature: flippedSerialized });
        const flippedNormalized = getAddress(flippedRecovered);
        if (normalizedAttester === flippedNormalized) {
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=typed-data-handler.js.map