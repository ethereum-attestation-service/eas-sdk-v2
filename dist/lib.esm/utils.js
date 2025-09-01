import EASArtifact from '@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json';
import { decodeEventLog, keccak256, stringToHex } from 'viem';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_BYTES = '0x';
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
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
const getDataFromReceipt = (receipt, event, attribute) => {
    const abi = EASArtifact.abi;
    const logs = receipt.logs.filter((l) => l.topics[0] === TOPICS[event]);
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
};
export const getUIDsFromAttestReceipt = (receipt) => getDataFromReceipt(receipt, Event.Attested, 'uid');
export const getTimestampFromTimestampReceipt = (receipt) => getDataFromReceipt(receipt, Event.Timestamped, 'timestamp').map((s) => BigInt(s));
export const getTimestampFromOffchainRevocationReceipt = (receipt) => getDataFromReceipt(receipt, Event.RevokedOffchain, 'timestamp').map((s) => BigInt(s));
export const getUIDFromAttestTx = async (res) => {
    return (await getUIDsFromMultiAttestTx(res))[0];
};
export const getUIDsFromMultiAttestTx = async (res) => {
    const tx = await res;
    // Ethers responses expose wait(); cast the receipt to our minimal shape
    const receipt = (await tx.wait());
    if (!receipt) {
        throw new Error(`Unable to confirm: ${tx}`);
    }
    return getUIDsFromAttestReceipt(receipt);
};
//# sourceMappingURL=utils.js.map