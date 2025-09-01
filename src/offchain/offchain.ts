import { bytesToHex, encodeAbiParameters, encodePacked, keccak256, stringToHex, toBytes } from 'viem';
import { EAS } from '../eas';
import { ZERO_ADDRESS, ZERO_BYTES32 } from '../utils';
import {
  DomainTypedData,
  EIP712MessageTypes,
  EIP712Params,
  EIP712Response,
  EIP712Types,
  InvalidPrimaryType,
  InvalidTypes,
  TypeDataSigner,
  TypedDataHandler
} from './typed-data-handler';
import { EIP712_NAME } from './versions';

export { EIP712Request, EIP712MessageTypes } from './typed-data-handler';

export interface OffchainAttestationType extends EIP712Types<EIP712MessageTypes> {
  domain: string;
}

export enum OffchainAttestationVersion {
  Legacy = 0,
  Version1 = 1,
  Version2 = 2
}

export const OFFCHAIN_ATTESTATION_TYPES: Record<OffchainAttestationVersion, OffchainAttestationType[]> = {
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

export type OffchainAttestationParams = {
  schema: string;
  recipient: string;
  time: bigint;
  expirationTime: bigint;
  revocable: boolean;
  refUID: string;
  data: string;
  salt?: string;
} & Partial<EIP712Params>;

export type OffchainAttestationTypedData = OffchainAttestationParams & { version: OffchainAttestationVersion };

export type OffchainAttestationOptions = {
  salt?: string;
  verifyOnchain: boolean;
};

const DEFAULT_OFFCHAIN_ATTESTATION_OPTIONS: OffchainAttestationOptions = {
  verifyOnchain: false
};

export interface SignedOffchainAttestation extends EIP712Response<EIP712MessageTypes, OffchainAttestationTypedData> {
  version: OffchainAttestationVersion;
  uid: string;
}

export const SALT_SIZE = 32;

export interface OffchainConfig {
  address: string;
  version: string;
  chainId: bigint;
}

export class Offchain extends TypedDataHandler {
  public readonly version: OffchainAttestationVersion;
  protected signingType: OffchainAttestationType;
  protected readonly verificationTypes: OffchainAttestationType[];
  private readonly eas: EAS;

  constructor(config: OffchainConfig, version: OffchainAttestationVersion, eas: EAS) {
    if (version > OffchainAttestationVersion.Version2) {
      throw new Error('Unsupported version');
    }

    super({ ...config, name: EIP712_NAME });

    this.version = version;
    this.verificationTypes = OFFCHAIN_ATTESTATION_TYPES[this.version];
    this.signingType = this.verificationTypes[0];

    this.eas = eas;
  }

  public getDomainSeparator() {
    return keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
        [
          keccak256(stringToHex(this.signingType.domain, { size: 32 }) as `0x${string}`),
          keccak256(stringToHex(this.config.version, { size: 32 }) as `0x${string}`),
          this.config.chainId,
          this.config.address as `0x${string}`
        ]
      )
    );
  }

  public getDomainTypedData(): DomainTypedData {
    return {
      name: this.signingType.domain,
      version: this.config.version,
      chainId: this.config.chainId,
      verifyingContract: this.config.address
    };
  }

  public async signOffchainAttestation(
    params: OffchainAttestationParams,
    signer: TypeDataSigner,
    options?: OffchainAttestationOptions
  ): Promise<SignedOffchainAttestation> {
    const typedData = { version: this.version, ...params };

    // If no salt was provided - generate a random salt.
    if (this.version >= OffchainAttestationVersion.Version2 && !typedData.salt) {
      const rand = new Uint8Array(SALT_SIZE);
      crypto.getRandomValues(rand);
      typedData.salt = bytesToHex(rand);
    }

    const signedRequest = await this.signTypedDataRequest<EIP712MessageTypes, OffchainAttestationTypedData>(
      typedData,
      {
        domain: this.getDomainTypedData(),
        primaryType: this.signingType.primaryType,
        message: typedData,
        types: this.signingType.types
      },
      signer
    );

    const { verifyOnchain } = { ...DEFAULT_OFFCHAIN_ATTESTATION_OPTIONS, ...options };
    if (verifyOnchain) {
      try {
        const { schema, recipient, expirationTime, revocable, data } = params;

        // Verify the offchain attestation onchain by simulating a contract call to attest. Since onchain verification
        // makes sure that any referenced attestations exist, we will set refUID to ZERO_BYTES32.
        // Simulate onchain attest call (read-only) using EAS helper
        await this.eas.simulateAttest(
          {
            schema,
            data: { recipient, expirationTime, revocable, refUID: params.refUID || ZERO_BYTES32, data, value: 0 }
          },
          undefined
        );
      } catch (e: unknown) {
        throw new Error(`Unable to verify offchain attestation with: ${e}`);
      }
    }

    return {
      version: this.version,
      uid: this.getOffchainUID(typedData),
      ...signedRequest
    };
  }

  public async verifyOffchainAttestationSignature(attester: string, attestation: SignedOffchainAttestation): Promise<boolean> {
    const typeCount = this.verificationTypes.length;

    const asyncSome = async <T>(arr: T[], cb: (value: T, index: number) => Promise<boolean>): Promise<boolean> => {
      for (let i = 0; i < arr.length; i++) {
        if (await cb(arr[i], i)) {
          return true;
        }
      }
      return false;
    };

    const result = await asyncSome(this.verificationTypes, async (type, index) => {
      try {
        return await this.verifyTypedDataRequestSignature(
          attester,
          attestation,
          {
            primaryType: type.primaryType,
            types: type.types
          },
          false
        );
      } catch (e) {
        if (index !== typeCount - 1 && (e instanceof InvalidPrimaryType || e instanceof InvalidTypes)) {
          return false;
        }

        throw e as unknown;
      }
    });

    if (result) {
      return true;
    }

    // Fallback: verify using the embedded types in the payload as-is
    try {
      return await this.verifyTypedDataRequestSignature(
        attester,
        attestation,
        { primaryType: attestation.primaryType, types: attestation.types },
        false
      );
    } catch (_e) {
      return false;
    }
  }

  private getOffchainUID(params: OffchainAttestationParams): string {
    return Offchain.getOffchainUID(
      this.version,
      params.schema,
      params.recipient,
      params.time,
      params.expirationTime,
      params.revocable,
      params.refUID,
      params.data,
      params.salt
    );
  }

  public static getOffchainUID(
    version: number,
    schema: string,
    recipient: string,
    time: bigint,
    expirationTime: bigint,
    revocable: boolean,
    refUID: string,
    data: string,
    salt?: string
  ) {
    switch (version) {
      case OffchainAttestationVersion.Legacy:
        return keccak256(
          encodePacked(
            ['bytes32', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'],
            [
              schema as `0x${string}`,
              recipient as `0x${string}`,
              ZERO_ADDRESS as `0x${string}`,
              time,
              expirationTime,
              revocable,
              refUID as `0x${string}`,
              data as `0x${string}`,
              0
            ]
          )
        );

      case OffchainAttestationVersion.Version1:
        return keccak256(
          encodePacked(
            [
              'uint16',
              'bytes32',
              'address',
              'address',
              'uint64',
              'uint64',
              'bool',
              'bytes32',
              'bytes',
              'uint32'
            ],
            [
              version,
              schema as `0x${string}`,
              recipient as `0x${string}`,
              ZERO_ADDRESS as `0x${string}`,
              time,
              expirationTime,
              revocable,
              refUID as `0x${string}`,
              data as `0x${string}`,
              0
            ]
          )
        );

      case OffchainAttestationVersion.Version2:
        return keccak256(
          encodePacked(
            [
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
            ],
            [
              version,
              schema as `0x${string}`,
              recipient as `0x${string}`,
              ZERO_ADDRESS as `0x${string}`,
              time,
              expirationTime,
              revocable,
              refUID as `0x${string}`,
              data as `0x${string}`,
              salt as `0x${string}`,
              0
            ]
          )
        );

      default:
        throw new Error('Unsupported version');
    }
  }

  // Compatibility helper for older encodings where schema was treated as bytes instead of bytes32
  public static getOffchainUidLegacySchema(
    version: number,
    schema: string,
    recipient: string,
    time: bigint,
    expirationTime: bigint,
    revocable: boolean,
    refUID: string,
    data: string,
    salt?: string
  ) {
    switch (version) {
      case OffchainAttestationVersion.Legacy:
        return keccak256(
          encodePacked(
            ['bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'],
            [
              bytesToHex(toBytes(schema)) as `0x${string}`,
              recipient as `0x${string}`,
              ZERO_ADDRESS as `0x${string}`,
              time,
              expirationTime,
              revocable,
              refUID as `0x${string}`,
              data as `0x${string}`,
              0
            ]
          )
        );

      case OffchainAttestationVersion.Version1:
        return keccak256(
          encodePacked(
            ['uint16', 'bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'],
            [
              version,
              bytesToHex(toBytes(schema)) as `0x${string}`,
              recipient as `0x${string}`,
              ZERO_ADDRESS as `0x${string}`,
              time,
              expirationTime,
              revocable,
              refUID as `0x${string}`,
              data as `0x${string}`,
              0
            ]
          )
        );

      case OffchainAttestationVersion.Version2:
        return keccak256(
          encodePacked(
            [
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
            ],
            [
              version,
              bytesToHex(toBytes(schema)) as `0x${string}`,
              recipient as `0x${string}`,
              ZERO_ADDRESS as `0x${string}`,
              time,
              expirationTime,
              revocable,
              refUID as `0x${string}`,
              data as `0x${string}`,
              salt as `0x${string}`,
              0
            ]
          )
        );

      default:
        throw new Error('Unsupported version');
    }
  }
}
