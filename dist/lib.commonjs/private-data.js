"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateData = void 0;
const merkle_tree_1 = require("@openzeppelin/merkle-tree");
const viem_1 = require("viem");
const merkleValueAbiEncoding = ['string', 'string', 'bytes', 'bytes32'];
class PrivateData {
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
                    return (0, viem_1.bytesToHex)(rand);
                })()
            }));
        }
        this.tree = this.encodeValuesToMerkleTree(this.values);
    }
    encodeValuesToMerkleTree(values) {
        const encodedValues = this.encodeMerkleValues(values);
        return merkle_tree_1.StandardMerkleTree.of(encodedValues, merkleValueAbiEncoding);
    }
    encodeMerkleValues(values) {
        return values.map((v) => [v.type, v.name, (0, viem_1.encodeAbiParameters)([{ type: v.type }], [v.value]), v.salt]);
    }
    decodeMerkleValues(values) {
        return values.map((v) => ({
            type: v[0],
            name: v[1],
            value: (0, viem_1.decodeAbiParameters)([{ type: v[0] }], v[2])[0],
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
        return merkle_tree_1.StandardMerkleTree.verifyMultiProof(root, merkleValueAbiEncoding, encodedProof);
    }
    static encodeMerkleValues(values) {
        return values.map((v) => [v.type, v.name, (0, viem_1.encodeAbiParameters)([{ type: v.type }], [v.value]), v.salt]);
    }
    static verifyFullTree(tree) {
        const encodedValues = this.encodeMerkleValues(tree.values);
        const merkleTree = merkle_tree_1.StandardMerkleTree.of(encodedValues, merkleValueAbiEncoding);
        return merkleTree.root;
    }
}
exports.PrivateData = PrivateData;
// Local minimal abi coder helpers using viem to avoid ethers
// These helpers handle a single value encode/decode for leaf packing
// removed local helpers; using top-level viem helpers
//# sourceMappingURL=private-data.js.map