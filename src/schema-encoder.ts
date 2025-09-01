import { CID } from 'multiformats';
import { decodeAbiParameters, encodeAbiParameters, isHex, parseAbiParameters, stringToHex } from 'viem';
import { ZERO_ADDRESS } from './utils';

export type SchemaValue =
  | string
  | boolean
  | number
  | bigint
  | Record<string, unknown>
  | Record<string, unknown>[]
  | unknown[];
export interface SchemaItem {
  name: string;
  type: string;
  value: SchemaValue;
}

export interface SchemaItemWithSignature extends SchemaItem {
  signature: string;
}

export interface SchemaDecodedItem {
  name: string;
  type: string;
  signature: string;
  value: SchemaItem;
}

const TUPLE_TYPE = 'tuple';
const TUPLE_ARRAY_TYPE = 'tuple[]';
const BYTES32 = 'bytes32';
const ADDRESS = 'address';
const BOOL = 'bool';
const UINT = 'uint';
const IPFS_HASH = 'ipfsHash';

export class SchemaEncoder {
  public schema: SchemaItemWithSignature[];

  constructor(schema: string) {
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
    const inputs = parseAbiParameters(normalizedSchema) as Array<{
      name?: string;
      type: string;
      components?: Array<{ name?: string; type: string }>;
    }>;

    for (const param of inputs) {
      const name = param.name ?? '';
      let type = param.type;
      let signature = name ? `${type} ${name}` : type;
      const signatureSuffix = name ? ` ${name}` : '';
      let typeName = type;

      const isArray = type.endsWith('[]');
      const components = param.components ?? [];
      const componentsType = `(${components.map((c) => c.type).join(',')})${isArray ? '[]' : ''}`;
      const componentsFullType = `(${components.map((c) => (c.name ? `${c.type} ${c.name}` : c.type)).join(',')})${
        isArray ? '[]' : ''
      }`;

      if (type.startsWith(TUPLE_TYPE)) {
        type = componentsType;
        signature = `${componentsFullType}${signatureSuffix}`;
      } else if (type === TUPLE_ARRAY_TYPE) {
        type = `${componentsType}[]`;
        signature = `${componentsFullType}[]${signatureSuffix}`;
      } else if (type.includes('[]')) {
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

  public encodeData(params: SchemaItem[]): string {
    if (params.length !== this.schema.length) {
      throw new Error('Invalid number or values');
    }

    const data: unknown[] = [];

    for (const [index, schemaItem] of this.schema.entries()) {
      const { type, name, value } = params[index];
      const sanitizedType = type.replace(/\s/g, '');

      if (
        sanitizedType !== schemaItem.type &&
        sanitizedType !== schemaItem.signature &&
        !(sanitizedType === IPFS_HASH && schemaItem.type === BYTES32)
      ) {
        throw new Error(`Incompatible param type: ${sanitizedType}`);
      }

      if (name !== schemaItem.name) {
        throw new Error(`Incompatible param name: ${name}`);
      }

      data.push(
        schemaItem.type === BYTES32 && schemaItem.name === IPFS_HASH
          ? SchemaEncoder.decodeIpfsValue(value as string)
          : schemaItem.type === BYTES32 && typeof value === 'string' && !isHex(value)
            ? stringToHex(value, { size: 32 })
            : value
      );
    }

    return encodeAbiParameters(this.abiParams(), data as unknown[]);
  }

  public decodeData(data: string): SchemaDecodedItem[] {
    const values = decodeAbiParameters(this.abiParams(), data as `0x${string}`) as unknown[];

    return this.schema.map((s, i) => {
      const [input] = parseAbiParameters(s.signature) as Array<{
        name?: string;
        type: string;
        components?: Array<{ name?: string; type: string }>;
      }>;
      let value = values[i];
      const components = input.components ?? [];

      const isTupleLike = components.length > 0;
      const isArrayType = s.type.includes('[]') || input.type.includes('[]');

      if (isTupleLike) {
        if (isArrayType) {
          const items = Array.isArray(value) ? (value as unknown[]) : [];
          const namedValues: Array<Array<{ name: string | undefined; type: string; value: unknown }>> = [];
          for (const item of items) {
            const fields: Array<{ name: string | undefined; type: string; value: unknown }> = [];
            for (const [k, component] of components.entries()) {
              const fromArray = Array.isArray(item) ? (item as unknown[])[k] : undefined;
              const fromObject =
                typeof item === 'object' && item !== null && (component.name ?? '') in (item as Record<string, unknown>)
                  ? (item as Record<string, unknown>)[(component.name as string) ?? String(k)]
                  : undefined;
              const v = fromArray !== undefined ? fromArray : fromObject;
              fields.push({ name: component.name, type: component.type, value: v });
            }
            namedValues.push(fields);
          }
          value = { name: s.name, type: s.type, value: namedValues } as unknown as SchemaItem;
        } else {
          const item = value as unknown;
          const fields: Array<{ name: string | undefined; type: string; value: unknown }> = [];
          for (const [k, component] of components.entries()) {
            const fromArray = Array.isArray(item) ? (item as unknown[])[k] : undefined;
            const fromObject =
              typeof item === 'object' && item !== null && (component.name ?? '') in (item as Record<string, unknown>)
                ? (item as Record<string, unknown>)[(component.name as string) ?? String(k)]
                : undefined;
            const v = fromArray !== undefined ? fromArray : fromObject;
            fields.push({ name: component.name, type: component.type, value: v });
          }
          value = { name: s.name, type: s.type, value: fields } as unknown as SchemaItem;
        }
      } else {
        value = { name: s.name, type: s.type, value } as unknown as SchemaItem;
      }

      return {
        name: s.name,
        type: s.type,
        signature: s.signature,
        value: value as unknown as SchemaItem
      };
    });
  }

  public static isSchemaValid(schema: string) {
    try {
      new SchemaEncoder(schema);

      return true;
    } catch (_e) {
      return false;
    }
  }

  public isEncodedDataValid(data: string) {
    try {
      this.decodeData(data);

      return true;
    } catch (_e) {
      return false;
    }
  }

  public static isCID(cid: string) {
    try {
      CID.parse(cid);
      return true;
    } catch {
      return false;
    }
  }

  public static encodeQmHash(hash: string): string {
    const a = CID.parse(hash);
    return encodeAbiParameters([{ type: BYTES32 }], [a.multihash.digest as unknown as `0x${string}`]);
  }

  public static decodeQmHash(bytes32: `0x${string}`): string {
    const digest = Uint8Array.from(Buffer.from(bytes32.slice(2), 'hex'));
    const dec = {
      digest: digest,
      code: 18,
      size: 32,
      bytes: Uint8Array.from([18, 32, ...digest])
    } as const;

    const dCID = CID.createV0(dec);
    return dCID.toString();
  }

  private static getDefaultValueForTypeName(typeName: string) {
    return typeName === BOOL ? false : typeName.includes(UINT) ? '0' : typeName === ADDRESS ? ZERO_ADDRESS : '';
  }

  private static decodeIpfsValue(val: string) {
    if (isHex(val)) {
      return SchemaEncoder.encodeBytes32Value(val);
    }

    try {
      const decodedHash = CID.parse(val);
      const encoded = encodeAbiParameters(
        [{ type: BYTES32 }],
        [decodedHash.multihash.digest as unknown as `0x${string}`]
      );

      return encoded;
    } catch {
      return SchemaEncoder.encodeBytes32Value(val);
    }
  }

  private static encodeBytes32Value(value: string) {
    try {
      encodeAbiParameters([{ type: BYTES32 }], [value as unknown as `0x${string}`]);
      return value;
    } catch (_e) {
      return stringToHex(value, { size: 32 });
    }
  }

  private abiParams() {
    return this.schema.map((s) => {
      const [input] = parseAbiParameters(s.signature) as Array<{
        name?: string;
        type: string;
        components?: Array<{ name?: string; type: string }>;
      }>;
      if (input.type.startsWith(TUPLE_TYPE)) {
        return { type: input.type, components: input.components ?? [] };
      }
      return { type: input.type };
    });
  }
}
