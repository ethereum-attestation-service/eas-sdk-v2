import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { bytesToHex, decodeAbiParameters, encodeAbiParameters } from 'viem';

export type FullMerkleDataTree = {
  root: string;
  values: MerkleValueWithSalt[];
};

export interface MerkleMultiProof {
  leaves: Leaf[];
  proof: string[];
  proofFlags: boolean[];
}

export interface Leaf {
  type: string;
  name: string;
  value: unknown;
  salt: string;
}

export interface MerkleValue {
  type: string;
  name: string;
  value: unknown;
}

export type MerkleValueWithSalt = MerkleValue & { salt: string };

export type EncodedMerkleValue = [string, string, string, string];

const merkleValueAbiEncoding: EncodedMerkleValue = ['string', 'string', 'bytes', 'bytes32'];

export class PrivateData {
  private tree: StandardMerkleTree<EncodedMerkleValue>;
  private values: MerkleValueWithSalt[];

  constructor(values: MerkleValue[] | MerkleValueWithSalt[]) {
    if (values.some((v) => Object.prototype.hasOwnProperty.call(v, 'salt'))) {
      this.values = values as MerkleValueWithSalt[];
    } else {
      this.values = values.map((v) => ({
        ...v,
        salt: (() => {
          const rand = new Uint8Array(32);
          crypto.getRandomValues(rand);
          return bytesToHex(rand);
        })()
      }));
    }

    this.tree = this.encodeValuesToMerkleTree(this.values);
  }

  private encodeValuesToMerkleTree(values: MerkleValueWithSalt[]): StandardMerkleTree<EncodedMerkleValue> {
    const encodedValues = this.encodeMerkleValues(values);
    return StandardMerkleTree.of(encodedValues, merkleValueAbiEncoding);
  }

  private encodeMerkleValues(values: MerkleValueWithSalt[]): EncodedMerkleValue[] {
    return values.map((v) => [v.type, v.name, encodeAbiParameters([{ type: v.type }], [v.value]), v.salt]);
  }

  private decodeMerkleValues(values: EncodedMerkleValue[]): MerkleValueWithSalt[] {
    return values.map((v) => ({
      type: v[0],
      name: v[1],
      value: (decodeAbiParameters([{ type: v[0] }], v[2] as `0x${string}`) as readonly unknown[])[0],
      salt: v[3]
    }));
  }

  public getFullTree(): FullMerkleDataTree {
    return {
      root: this.tree.root,
      values: this.values
    };
  }

  public generateMultiProof(indexes: number[]): MerkleMultiProof {
    const multiProof = this.tree.getMultiProof(indexes);
    return {
      ...multiProof,
      leaves: this.decodeMerkleValues(multiProof.leaves)
    };
  }

  public static verifyMultiProof(root: string, proof: MerkleMultiProof): boolean {
    const encodedProof = {
      ...proof,
      leaves: this.encodeMerkleValues(proof.leaves)
    };
    return StandardMerkleTree.verifyMultiProof(root, merkleValueAbiEncoding, encodedProof);
  }

  private static encodeMerkleValues(values: Leaf[]): EncodedMerkleValue[] {
    return values.map((v) => [v.type, v.name, encodeAbiParameters([{ type: v.type }], [v.value]), v.salt]);
  }

  public static verifyFullTree(tree: FullMerkleDataTree): string {
    const encodedValues = this.encodeMerkleValues(tree.values);
    const merkleTree = StandardMerkleTree.of(encodedValues, merkleValueAbiEncoding);
    return merkleTree.root;
  }
}

// Local minimal abi coder helpers using viem to avoid ethers
// These helpers handle a single value encode/decode for leaf packing
// removed local helpers; using top-level viem helpers
