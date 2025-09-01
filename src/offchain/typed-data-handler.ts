import isEqual from 'lodash/isEqual';
import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  keccak256,
  recoverAddress,
  stringToHex
} from 'viem';
import { ZERO_ADDRESS } from '../utils';

export interface TypedDataField {
  name: string;
  type: string;
}

export interface TypeDataSigner {
  // Optional address accessor for convenience
  getAddress?: () => Promise<string> | string;
  signTypedData(
    domain: EIP712DomainTypedData,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>
  ): Promise<string>;
}

export interface DomainTypedData {
  chainId: bigint;
  name: string;
  verifyingContract: string;
  version: string;
}

export interface TypedDataParams {
  types: string[];
  values: unknown[];
}

export interface TypedData {
  name: string;
  type:
    | 'bool'
    | 'uint8'
    | 'uint16'
    | 'uint32'
    | 'uint64'
    | 'uint128'
    | 'uint256'
    | 'address'
    | 'string'
    | 'bytes'
    | 'bytes32';
}

export interface EIP712DomainTypedData {
  chainId: bigint;
  name: string;
  verifyingContract: string;
  version: string;
}

export interface EIP712MessageTypes {
  [additionalProperties: string]: TypedData[];
}

export type EIP712Params = {
  nonce?: bigint;
};

export interface EIP712Types<T extends EIP712MessageTypes> {
  primaryType: string;
  types: T;
}

export interface EIP712TypedData<T extends EIP712MessageTypes, P extends EIP712Params> extends EIP712Types<T> {
  domain: EIP712DomainTypedData;
  message: P;
}

export interface Signature {
  r: string;
  s: string;
  v: number;
}

export type EIP712Request<T extends EIP712MessageTypes, P extends EIP712Params> = EIP712TypedData<T, P>;

export type EIP712Response<T extends EIP712MessageTypes, P extends EIP712Params> = EIP712TypedData<T, P> & {
  signature: Signature;
};

export const EIP712_DOMAIN = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';

export class InvalidDomain extends Error {}
export class InvalidPrimaryType extends Error {}
export class InvalidTypes extends Error {}
export class InvalidAddress extends Error {}

export interface TypedDataConfig {
  address: string;
  version: string;
  chainId: bigint;
  name: string;
}

export abstract class TypedDataHandler {
  public config: TypedDataConfig;

  constructor(config: TypedDataConfig) {
    this.config = config;
  }

  public getDomainSeparator() {
    return TypedDataHandler.getDomainSeparator(this.config);
  }

  public static getDomainSeparator(config: TypedDataConfig) {
    return keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
        [
          keccak256(stringToHex(EIP712_DOMAIN) as `0x${string}`),
          keccak256(stringToHex(config.name) as `0x${string}`),
          keccak256(stringToHex(config.version) as `0x${string}`),
          config.chainId,
          config.address as `0x${string}`
        ]
      )
    );
  }

  public getDomainTypedData(): DomainTypedData {
    return {
      name: this.config.name,
      version: this.config.version,
      chainId: this.config.chainId,
      verifyingContract: this.config.address
    };
  }

  public async signTypedDataRequest<T extends EIP712MessageTypes, P extends EIP712Params>(
    params: P,
    types: EIP712TypedData<T, P>,
    signer: TypeDataSigner
  ): Promise<EIP712Response<T, P>> {
    const rawSignature = await signer.signTypedData(types.domain, types.types, params);
    const sig = rawSignature.startsWith('0x') ? rawSignature.slice(2) : rawSignature;
    const r = `0x${sig.slice(0, 64)}`;
    const s = `0x${sig.slice(64, 128)}`;
    const v = parseInt(sig.slice(128, 130), 16);

    return { ...types, signature: { v, r, s } };
  }

  public async verifyTypedDataRequestSignature<T extends EIP712MessageTypes, P extends EIP712Params>(
    attester: string,
    response: EIP712Response<T, P>,
    types: EIP712Types<T>,
    strict = true
  ): Promise<boolean> {
    // Normalize the chain ID
    const domain: EIP712DomainTypedData = { ...response.domain, chainId: BigInt(response.domain.chainId) };

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
    const typeKeys = Object.keys(response.types as unknown as Record<string, unknown>);
    const inferredPrimaryType = (typeKeys.find((k) => k !== 'EIP712Domain') || response.primaryType) as string;
    const effectivePrimaryType = (response.types as unknown as Record<string, unknown>)[response.primaryType]
      ? (response.primaryType as unknown as string)
      : inferredPrimaryType;

    const { signature } = response;
    const vNorm = signature.v >= 27 ? signature.v - 27 : signature.v;
    const vHex = `0x${vNorm.toString(16).padStart(2, '0')}` as const;
    const serialized = concatHex([signature.r as `0x${string}`, signature.s as `0x${string}`, vHex]);
    const hash = hashTypedData({
      domain: {
        ...domain,
        verifyingContract: domain.verifyingContract as `0x${string}`
      },
      primaryType: effectivePrimaryType,
      types: response.types as unknown as Record<string, Array<{ name: string; type: string }>>,
      message: response.message as unknown as Record<string, unknown>
    });
    const recoveredAddress = await recoverAddress({ hash, signature: serialized as `0x${string}` });

    return getAddress(attester) === getAddress(recoveredAddress as unknown as string);
  }
}
