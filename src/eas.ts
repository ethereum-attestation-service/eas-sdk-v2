import EASLegacyArtifact from '@ethereum-attestation-service/eas-contracts-legacy/artifacts/contracts/EAS.sol/EAS.json';
import EASArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json';
import semver from 'semver';
import { encodePacked, keccak256, stringToHex, type Abi } from 'viem';
import { EIP712Proxy } from './eip712-proxy';
import { legacyVersion } from './legacy/version';
import { Delegated, Offchain, OffchainAttestationVersion } from './offchain';
import {
  AttestationRequest,
  DelegatedAttestationRequest,
  DelegatedProxyAttestationRequest,
  DelegatedProxyRevocationRequest,
  DelegatedRevocationRequest,
  MultiAttestationRequest,
  MultiDelegatedAttestationRequest,
  MultiDelegatedProxyAttestationRequest,
  MultiDelegatedProxyRevocationRequest,
  MultiDelegatedRevocationRequest,
  MultiRevocationRequest,
  NO_EXPIRATION,
  RevocationRequest
} from './request';
import {
  Base,
  RequireSigner,
  Transaction,
  TransactionProvider,
  TransactionSigner,
  type TransactionReceipt
} from './transaction';
import {
  getTimestampFromOffchainRevocationReceipt,
  getTimestampFromTimestampReceipt,
  getUIDsFromAttestReceipt,
  ZERO_ADDRESS,
  ZERO_BYTES32
} from './utils';

const LEGACY_VERSION = '1.1.0';

export * from './request';

export interface Attestation {
  uid: string;
  schema: string;
  refUID: string;
  time: bigint;
  expirationTime: bigint;
  revocationTime: bigint;
  recipient: string;
  revocable: boolean;
  attester: string;
  data: string;
}

export interface EASOptions {
  signer?: TransactionSigner | TransactionProvider;
  proxy?: EIP712Proxy;
}

// Overloads to support both legacy (experimental) and standard (TC39) decorators
export function RequireProxy(
  _target: unknown,
  _propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RequireProxy<TFn extends (this: unknown, ...args: any[]) => any>(
  value: TFn,
  _context: ClassMethodDecoratorContext
): TFn;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RequireProxy(...args: any[]): any {
  // Standard decorator: (value, context)
  if (args.length === 2) {
    const [value] = args as [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this: unknown, ...fnArgs: any[]) => any,
      ClassMethodDecoratorContext
    ];

    const wrapped = function (
      this: unknown,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...fnArgs: any[]
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(this as any).proxy) {
        throw new Error('Invalid proxy');
      }
      return value.apply(this as unknown, fnArgs);
    };

    return wrapped;
  }

  // Legacy decorator: (target, propertyKey, descriptor)
  const [_target, _propertyKey, descriptor] = args as [unknown, string, PropertyDescriptor];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = descriptor.value as unknown as (this: unknown, ...fnArgs: any[]) => unknown;

  descriptor.value = function (
    this: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...fnArgs: any[]
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(this as any).proxy) {
      throw new Error('Invalid proxy');
    }
    return original.apply(this as unknown, fnArgs);
  };

  return descriptor;
}

export class EAS extends Base {
  private proxy?: EIP712Proxy;
  private delegated?: Delegated;
  private offchain?: Offchain;
  private version?: string;
  private readonly legacyAbi: Abi;

  constructor(address: string, options?: EASOptions) {
    const { signer, proxy } = options || {};

    super((EASArtifact as { abi: Abi }).abi as Abi, address, signer);
    this.legacyAbi = (EASLegacyArtifact as { abi: Abi }).abi as Abi;

    if (proxy) {
      this.proxy = proxy;
    }

    (this.contract as unknown as { version: () => Promise<string> }).version = () => this.read<string>('version');
  }

  // Connects the API to a specific signer
  public connect(signer: TransactionSigner | TransactionProvider) {
    delete this.delegated;
    delete this.offchain;

    super.connect(signer);

    return this;
  }

  // Returns the version of the contract
  public async getVersion(): Promise<string> {
    if (this.version) {
      return this.version;
    }

    return (this.version =
      (await legacyVersion({
        getAddress: () => this.getAddress(),
        runner: { provider: this.getProvider() }
      } as unknown as { getAddress: () => Promise<string> | string; runner?: { provider?: TransactionProvider } })) ??
      (await this.read<string>('version')));
  }

  // Returns an existing schema by attestation UID
  public getAttestation(uid: string): Promise<Attestation> {
    return this.read<Attestation>('getAttestation', [uid]);
  }

  // Returns whether an attestation is valid
  public isAttestationValid(uid: string): Promise<boolean> {
    return this.read<boolean>('isAttestationValid', [uid]);
  }

  // Returns whether an attestation has been revoked
  public async isAttestationRevoked(uid: string): Promise<boolean> {
    const attestation = await this.read<Attestation>('getAttestation', [uid]);
    if (attestation.uid === ZERO_BYTES32) {
      throw new Error('Invalid attestation');
    }

    return attestation.revocationTime != NO_EXPIRATION;
  }

  // Returns the timestamp that the specified data was timestamped with
  public getTimestamp(data: string): Promise<bigint> {
    return this.read<bigint>('getTimestamp', [data]);
  }

  // Returns the timestamp that the specified data was timestamped with
  public getRevocationOffchain(user: string, uid: string): Promise<bigint> {
    return this.read<bigint>('getRevokeOffchain', [user, uid]);
  }

  // Returns the EIP712 proxy
  public getEIP712Proxy(): EIP712Proxy | undefined {
    return this.proxy;
  }

  // Returns the delegated attestations helper
  public getDelegated(): Promise<Delegated> | Delegated {
    if (this.delegated) {
      return this.delegated;
    }

    return this.setDelegated();
  }

  // Returns the offchain attestations helper
  public getOffchain(): Promise<Offchain> | Offchain {
    if (this.offchain) {
      return this.offchain;
    }

    return this.setOffchain();
  }

  // Attests to a specific schema
  // eslint-disable-next-line require-await
  @RequireSigner
  public async attest(
    {
      schema,
      data: {
        recipient = ZERO_ADDRESS,
        data,
        expirationTime = NO_EXPIRATION,
        revocable = true,
        refUID = ZERO_BYTES32,
        value = 0n
      }
    }: AttestationRequest,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<string>> {
    const tx = this.populate(
      'attest',
      [{ schema, data: { recipient, expirationTime, revocable, refUID, data, value } }],
      {
        ...(overrides as unknown as object),
        value
      }
    );
    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getUIDsFromAttestReceipt(receipt)[0])
    );
  }

  // Attests to a specific schema via an EIP712 delegation request
  @RequireSigner
  public async attestByDelegation(
    {
      schema,
      data: {
        recipient = ZERO_ADDRESS,
        data,
        expirationTime = NO_EXPIRATION,
        revocable = true,
        refUID = ZERO_BYTES32,
        value = 0n
      },
      signature,
      attester,
      deadline = NO_EXPIRATION
    }: DelegatedAttestationRequest,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<string>> {
    const isLegacy = await this.isLegacyContract();
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

    const tx = isLegacy
      ? this.populateWithAbi(this.legacyAbi, 'attestByDelegation', args, { ...(overrides as unknown as object), value })
      : this.populate('attestByDelegation', args, { ...(overrides as unknown as object), value });

    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getUIDsFromAttestReceipt(receipt)[0])
    );
  }

  // Multi-attests to multiple schemas
  // eslint-disable-next-line require-await
  @RequireSigner
  public async multiAttest(
    requests: MultiAttestationRequest[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<string[]>> {
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
      ...(overrides as unknown as object),
      value: requestedValue
    });
    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getUIDsFromAttestReceipt(receipt))
    );
  }

  // Multi-attests to multiple schemas via an EIP712 delegation requests
  @RequireSigner
  public async multiAttestByDelegation(
    requests: MultiDelegatedAttestationRequest[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<string[]>> {
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
    const tx = isLegacy
      ? this.populateWithAbi(this.legacyAbi, 'multiAttestByDelegation', args, {
          ...(overrides as unknown as object),
          value: requestedValue
        })
      : this.populate('multiAttestByDelegation', args, { ...(overrides as unknown as object), value: requestedValue });

    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getUIDsFromAttestReceipt(receipt))
    );
  }

  // Revokes an existing attestation
  // eslint-disable-next-line require-await
  @RequireSigner
  public async revoke(
    { schema, data: { uid, value = 0n } }: RevocationRequest,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
    const tx = this.populate('revoke', [{ schema, data: { uid, value } }], {
      ...(overrides as unknown as object),
      value
    });
    return new Transaction(tx, this.signer!, async () => {});
  }

  // Revokes an existing attestation an EIP712 delegation request
  @RequireSigner
  public async revokeByDelegation(
    { schema, data: { uid, value = 0n }, signature, revoker, deadline = NO_EXPIRATION }: DelegatedRevocationRequest,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
    const isLegacy = await this.isLegacyContract();
    const args = isLegacy
      ? [{ schema, data: { uid, value }, signature, revoker }]
      : [{ schema, data: { uid, value }, signature, revoker, deadline }];
    const tx = isLegacy
      ? this.populateWithAbi(this.legacyAbi, 'revokeByDelegation', args, { ...(overrides as unknown as object), value })
      : this.populate('revokeByDelegation', args, { ...(overrides as unknown as object), value });
    return new Transaction(tx, this.signer!, async () => {});
  }

  // Multi-revokes multiple attestations
  // eslint-disable-next-line require-await
  @RequireSigner
  public async multiRevoke(
    requests: MultiRevocationRequest[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
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
      ...(overrides as unknown as object),
      value: requestedValue
    });
    return new Transaction(tx, this.signer!, () => Promise.resolve(undefined));
  }

  // Multi-revokes multiple attestations via an EIP712 delegation requests
  @RequireSigner
  public async multiRevokeByDelegation(
    requests: MultiDelegatedRevocationRequest[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
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
    const tx = isLegacy
      ? this.populateWithAbi(this.legacyAbi, 'multiRevokeByDelegation', args, {
          ...(overrides as unknown as object),
          value: requestedValue
        })
      : this.populate('multiRevokeByDelegation', args, { ...(overrides as unknown as object), value: requestedValue });

    return new Transaction(tx, this.signer!, async () => {});
  }

  // Attests to a specific schema via an EIP712 delegation request using an external EIP712 proxy
  @RequireSigner
  @RequireProxy
  public attestByDelegationProxy(
    request: DelegatedProxyAttestationRequest,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<string>> {
    return this.proxy!.attestByDelegationProxy(request, overrides);
  }

  // Multi-attests to multiple schemas via an EIP712 delegation requests using an external EIP712 proxy
  @RequireSigner
  @RequireProxy
  public multiAttestByDelegationProxy(
    requests: MultiDelegatedProxyAttestationRequest[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<string[]>> {
    return this.proxy!.multiAttestByDelegationProxy(requests, overrides);
  }

  // Revokes an existing attestation an EIP712 delegation request using an external EIP712 proxy
  @RequireSigner
  @RequireProxy
  public revokeByDelegationProxy(
    request: DelegatedProxyRevocationRequest,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
    return this.proxy!.revokeByDelegationProxy(request, overrides);
  }

  // Multi-revokes multiple attestations via an EIP712 delegation requests using an external EIP712 proxy
  @RequireSigner
  @RequireProxy
  public multiRevokeByDelegationProxy(
    requests: MultiDelegatedProxyRevocationRequest[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<void>> {
    return this.proxy!.multiRevokeByDelegationProxy(requests, overrides);
  }

  // Timestamps the specified bytes32 data
  // eslint-disable-next-line require-await
  @RequireSigner
  public async timestamp(
    data: string,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<bigint>> {
    const tx = this.populate('timestamp', [data], overrides);
    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getTimestampFromTimestampReceipt(receipt)[0])
    );
  }

  // Timestamps the specified multiple bytes32 data
  // eslint-disable-next-line require-await
  @RequireSigner
  public async multiTimestamp(
    data: string[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<bigint[]>> {
    const tx = this.populate('multiTimestamp', [data], overrides);
    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getTimestampFromTimestampReceipt(receipt))
    );
  }

  // Revokes the specified offchain attestation UID
  // eslint-disable-next-line require-await
  @RequireSigner
  public async revokeOffchain(
    uid: string,
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<bigint>> {
    const tx = this.populate('revokeOffchain', [uid], overrides);
    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getTimestampFromOffchainRevocationReceipt(receipt)[0])
    );
  }

  // Revokes the specified multiple offchain attestation UIDs
  // eslint-disable-next-line require-await
  @RequireSigner
  public async multiRevokeOffchain(
    uids: string[],
    overrides?: Partial<import('./transaction').TransactionRequest>
  ): Promise<Transaction<bigint[]>> {
    const tx = this.populate('multiRevokeOffchain', [uids], overrides);
    return new Transaction(tx, this.signer!, (receipt: TransactionReceipt) =>
      Promise.resolve(getTimestampFromOffchainRevocationReceipt(receipt))
    );
  }

  // Returns the domain separator used in the encoding of the signatures for attest, and revoke
  public getDomainSeparator(): Promise<string> {
    return this.read<string>('getDomainSeparator');
  }

  // Returns the current nonce per-account.
  public getNonce(address: string): Promise<bigint> {
    return this.read<bigint>('getNonce', [address]);
  }

  // Returns the EIP712 type hash for the attest function
  public getAttestTypeHash(): Promise<string> {
    return this.read<string>('getAttestTypeHash');
  }

  // Returns the EIP712 type hash for the revoke function
  public getRevokeTypeHash(): Promise<string> {
    return this.read<string>('getRevokeTypeHash');
  }

  // Return attestation UID
  public static getAttestationUID = (
    schema: string,
    recipient: string,
    attester: string,
    time: bigint,
    expirationTime: bigint,
    revocable: boolean,
    refUID: string,
    data: string,
    bump: number
  ) =>
    keccak256(
      encodePacked(
        ['bytes', 'address', 'address', 'uint64', 'uint64', 'bool', 'bytes32', 'bytes', 'uint32'],
        [
          stringToHex(schema) as `0x${string}`,
          recipient as `0x${string}`,
          attester as `0x${string}`,
          time,
          expirationTime,
          revocable,
          refUID as `0x${string}`,
          data as `0x${string}`,
          bump
        ]
      )
    );

  // Simulate an attest call (read-only) for validation purposes
  public async simulateAttest(
    input: {
      schema: string;
      data: {
        recipient: string;
        expirationTime: bigint;
        revocable: boolean;
        refUID: string;
        data: string;
        value: bigint | number;
      };
    },
    from?: string
  ): Promise<void> {
    await (this.read<void>('attest', [input], from ? { from } : {}) as Promise<void>);
  }

  // Sets the delegated attestations helper
  private async setDelegated(): Promise<Delegated> {
    this.delegated = new Delegated(
      {
        address: this.getAddress(),
        domainSeparator: await this.getDomainSeparator(),
        chainId: await this.getChainId()
      },
      this
    );

    return this.delegated;
  }

  // Sets the offchain attestations helper
  private async setOffchain(): Promise<Offchain> {
    this.offchain = new Offchain(
      {
        address: this.getAddress(),
        version: await this.getVersion(),
        chainId: await this.getChainId()
      },
      OffchainAttestationVersion.Version2,
      this
    );

    return this.offchain;
  }

  private async isLegacyContract() {
    const version = await this.getVersion();
    const fullVersion = semver.coerce(version);
    if (!fullVersion) {
      throw new Error(`Invalid version: ${version}`);
    }
    return semver.lte(fullVersion, LEGACY_VERSION);
  }
}
