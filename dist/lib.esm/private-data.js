import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { bytesToHex, decodeAbiParameters, encodeAbiParameters } from 'viem';
const merkleValueAbiEncoding = ['string', 'string', 'bytes', 'bytes32'];
export class PrivateData {
    tree;
    values;
    constructor(values) {
        if (values.some((v) => Object.prototype.hasOwnProperty.call(v, 'salt'))) {
            this.values = values;
        }
        else {
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
    encodeValuesToMerkleTree(values) {
        const encodedValues = this.encodeMerkleValues(values);
        return StandardMerkleTree.of(encodedValues, merkleValueAbiEncoding);
    }
    encodeMerkleValues(values) {
        return values.map((v) => [v.type, v.name, encodeAbiParameters([{ type: v.type }], [v.value]), v.salt]);
    }
    decodeMerkleValues(values) {
        return values.map((v) => ({
            type: v[0],
            name: v[1],
            value: decodeAbiParameters([{ type: v[0] }], v[2])[0],
            salt: v[3]
        }));
    }
    getFullTree() {
        return {
            root: this.tree.root,
            values: this.values
        };
    }
    generateMultiProof(indexes) {
        const multiProof = this.tree.getMultiProof(indexes);
        return {
            ...multiProof,
            leaves: this.decodeMerkleValues(multiProof.leaves)
        };
    }
    static verifyMultiProof(root, proof) {
        const encodedProof = {
            ...proof,
            leaves: this.encodeMerkleValues(proof.leaves)
        };
        return StandardMerkleTree.verifyMultiProof(root, merkleValueAbiEncoding, encodedProof);
    }
    static encodeMerkleValues(values) {
        return values.map((v) => [v.type, v.name, encodeAbiParameters([{ type: v.type }], [v.value]), v.salt]);
    }
    static verifyFullTree(tree) {
        const encodedValues = this.encodeMerkleValues(tree.values);
        const merkleTree = StandardMerkleTree.of(encodedValues, merkleValueAbiEncoding);
        return merkleTree.root;
    }
}
// Local minimal abi coder helpers using viem to avoid ethers
// These helpers handle a single value encode/decode for leaf packing
// removed local helpers; using top-level viem helpers
//# sourceMappingURL=private-data.js.map