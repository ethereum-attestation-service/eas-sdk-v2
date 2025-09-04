import { CID } from 'multiformats';
import { decodeAbiParameters, encodeAbiParameters, isHex, parseAbiParameters, stringToHex } from 'viem';
import { ZERO_ADDRESS } from './utils.js';
const TUPLE_TYPE = 'tuple';
const TUPLE_ARRAY_TYPE = 'tuple[]';
const BYTES32 = 'bytes32';
const ADDRESS = 'address';
const BOOL = 'bool';
const UINT = 'uint';
const IPFS_HASH = 'ipfsHash';
export class SchemaEncoder {
    schema;
    constructor(schema) {
        this.schema = [];
        const fixedSchema = schema.replace(new RegExp(`${IPFS_HASH} (\\S+)`, 'g'), `${BYTES32} $1`);
        // Normalize excessive whitespace to satisfy abitype parser
        const normalizedSchema = fixedSchema
            .replace(/\s+/g, ' ')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .replace(/\s*,\s*/g, ', ')
            .trim();
        // Use viem to parse ABI parameter list; throws on invalid schema
        const inputs = parseAbiParameters(normalizedSchema);
        for (const param of inputs) {
            const name = param.name ?? '';
            let type = param.type;
            let signature = name ? `${type} ${name}` : type;
            const signatureSuffix = name ? ` ${name}` : '';
            let typeName = type;
            const isArray = type.endsWith('[]');
            const components = param.components ?? [];
            const componentsType = `(${components.map((c) => c.type).join(',')})${isArray ? '[]' : ''}`;
            const componentsFullType = `(${components.map((c) => (c.name ? `${c.type} ${c.name}` : c.type)).join(',')})${isArray ? '[]' : ''}`;
            if (type.startsWith(TUPLE_TYPE)) {
                type = componentsType;
                signature = `${componentsFullType}${signatureSuffix}`;
            }
            else if (type === TUPLE_ARRAY_TYPE) {
                type = `${componentsType}[]`;
                signature = `${componentsFullType}[]${signatureSuffix}`;
            }
            else if (type.includes('[]')) {
                typeName = typeName.replace('[]', '');
            }
            const singleValue = SchemaEncoder.getDefaultValueForTypeName(typeName);
            this.schema.push({
                name,
                type,
                signature,
                value: type.includes('[]') ? [] : singleValue
            });
        }
    }
    encodeData(params) {
        if (params.length !== this.schema.length) {
            throw new Error('Invalid number or values');
        }
        const data = [];
        for (const [index, schemaItem] of this.schema.entries()) {
            const { type, name, value } = params[index];
            const sanitizedType = type.replace(/\s/g, '');
            if (sanitizedType !== schemaItem.type &&
                sanitizedType !== schemaItem.signature &&
                !(sanitizedType === IPFS_HASH && schemaItem.type === BYTES32)) {
                throw new Error(`Incompatible param type: ${sanitizedType}`);
            }
            if (name !== schemaItem.name) {
                throw new Error(`Incompatible param name: ${name}`);
            }
            data.push(schemaItem.type === BYTES32 && schemaItem.name === IPFS_HASH
                ? SchemaEncoder.decodeIpfsValue(value)
                : schemaItem.type === BYTES32 && typeof value === 'string' && !isHex(value)
                    ? stringToHex(value, { size: 32 })
                    : value);
        }
        return encodeAbiParameters(this.abiParams(), data);
    }
    decodeData(data) {
        const values = decodeAbiParameters(this.abiParams(), data);
        return this.schema.map((s, i) => {
            const [input] = parseAbiParameters(s.signature);
            let value = values[i];
            const components = input.components ?? [];
            const isTupleLike = components.length > 0;
            const isArrayType = s.type.includes('[]') || input.type.includes('[]');
            if (isTupleLike) {
                if (isArrayType) {
                    const items = Array.isArray(value) ? value : [];
                    const namedValues = [];
                    for (const item of items) {
                        const fields = [];
                        for (const [k, component] of components.entries()) {
                            const fromArray = Array.isArray(item) ? item[k] : undefined;
                            const fromObject = typeof item === 'object' && item !== null && (component.name ?? '') in item
                                ? item[component.name ?? String(k)]
                                : undefined;
                            const v = fromArray !== undefined ? fromArray : fromObject;
                            fields.push({ name: component.name, type: component.type, value: v });
                        }
                        namedValues.push(fields);
                    }
                    value = { name: s.name, type: s.type, value: namedValues };
                }
                else {
                    const item = value;
                    const fields = [];
                    for (const [k, component] of components.entries()) {
                        const fromArray = Array.isArray(item) ? item[k] : undefined;
                        const fromObject = typeof item === 'object' && item !== null && (component.name ?? '') in item
                            ? item[component.name ?? String(k)]
                            : undefined;
                        const v = fromArray !== undefined ? fromArray : fromObject;
                        fields.push({ name: component.name, type: component.type, value: v });
                    }
                    value = { name: s.name, type: s.type, value: fields };
                }
            }
            else {
                value = { name: s.name, type: s.type, value };
            }
            return {
                name: s.name,
                type: s.type,
                signature: s.signature,
                value: value
            };
        });
    }
    static isSchemaValid(schema) {
        try {
            new SchemaEncoder(schema);
            return true;
        }
        catch (_e) {
            return false;
        }
    }
    isEncodedDataValid(data) {
        try {
            this.decodeData(data);
            return true;
        }
        catch (_e) {
            return false;
        }
    }
    static isCID(cid) {
        try {
            CID.parse(cid);
            return true;
        }
        catch {
            return false;
        }
    }
    static encodeQmHash(hash) {
        const a = CID.parse(hash);
        return encodeAbiParameters([{ type: BYTES32 }], [a.multihash.digest]);
    }
    static decodeQmHash(bytes32) {
        const digest = Uint8Array.from(Buffer.from(bytes32.slice(2), 'hex'));
        const dec = {
            digest: digest,
            code: 18,
            size: 32,
            bytes: Uint8Array.from([18, 32, ...digest])
        };
        const dCID = CID.createV0(dec);
        return dCID.toString();
    }
    static getDefaultValueForTypeName(typeName) {
        return typeName === BOOL ? false : typeName.includes(UINT) ? '0' : typeName === ADDRESS ? ZERO_ADDRESS : '';
    }
    static decodeIpfsValue(val) {
        if (isHex(val)) {
            return SchemaEncoder.encodeBytes32Value(val);
        }
        try {
            const decodedHash = CID.parse(val);
            const encoded = encodeAbiParameters([{ type: BYTES32 }], [decodedHash.multihash.digest]);
            return encoded;
        }
        catch {
            return SchemaEncoder.encodeBytes32Value(val);
        }
    }
    static encodeBytes32Value(value) {
        try {
            encodeAbiParameters([{ type: BYTES32 }], [value]);
            return value;
        }
        catch (_e) {
            return stringToHex(value, { size: 32 });
        }
    }
    abiParams() {
        return this.schema.map((s) => {
            const [input] = parseAbiParameters(s.signature);
            if (input.type.startsWith(TUPLE_TYPE)) {
                return { type: input.type, components: input.components ?? [] };
            }
            return { type: input.type };
        });
    }
}
//# sourceMappingURL=schema-encoder.js.map