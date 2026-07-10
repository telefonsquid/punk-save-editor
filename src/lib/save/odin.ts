/**
 * Reader and writer for the Odin Serializer binary format
 * (Sirenix.Serialization, DataFormat.Binary) used by PUNK for most save files.
 *
 * The reader parses the byte stream into a generic JSON-like tree. Object
 * nodes carry `$type` (assembly-qualified C# type name) and, for reference
 * nodes, `$id` so internal references (`$ref`) stay intact. Scalar entry
 * types that a JS value cannot encode unambiguously (int vs float, char vs
 * string, guid, …) are recorded per node in a hidden `$types` map so the
 * writer can re-emit the exact same entry types.
 *
 * The writer reproduces the game's `BinaryDataWriter` behavior exactly:
 * strings are always UTF-16LE (the game never enables
 * `CompressStringsTo8BitWhenPossible`), type names are interned in
 * first-occurrence order, and no end-of-stream marker is written.
 * `write(parse(bytes))` is byte-identical to `bytes` (verified against all
 * Odin files of a real save).
 */

/** Binary entry type markers (Sirenix.Serialization.BinaryEntryType). */
export enum EntryType {
	Invalid = 0,
	NamedStartOfReferenceNode = 1,
	UnnamedStartOfReferenceNode = 2,
	NamedStartOfStructNode = 3,
	UnnamedStartOfStructNode = 4,
	EndOfNode = 5,
	StartOfArray = 6,
	EndOfArray = 7,
	PrimitiveArray = 8,
	NamedInternalReference = 9,
	UnnamedInternalReference = 10,
	NamedExternalReferenceByIndex = 11,
	UnnamedExternalReferenceByIndex = 12,
	NamedExternalReferenceByGuid = 13,
	UnnamedExternalReferenceByGuid = 14,
	NamedSByte = 15,
	UnnamedSByte = 16,
	NamedByte = 17,
	UnnamedByte = 18,
	NamedShort = 19,
	UnnamedShort = 20,
	NamedUShort = 21,
	UnnamedUShort = 22,
	NamedInt = 23,
	UnnamedInt = 24,
	NamedUInt = 25,
	UnnamedUInt = 26,
	NamedLong = 27,
	UnnamedLong = 28,
	NamedULong = 29,
	UnnamedULong = 30,
	NamedFloat = 31,
	UnnamedFloat = 32,
	NamedDouble = 33,
	UnnamedDouble = 34,
	NamedDecimal = 35,
	UnnamedDecimal = 36,
	NamedChar = 37,
	UnnamedChar = 38,
	NamedString = 39,
	UnnamedString = 40,
	NamedGuid = 41,
	UnnamedGuid = 42,
	NamedBoolean = 43,
	UnnamedBoolean = 44,
	NamedNull = 45,
	UnnamedNull = 46,
	TypeName = 47,
	TypeID = 48,
	EndOfStream = 49,
	NamedExternalReferenceByString = 50,
	UnnamedExternalReferenceByString = 51
}

/** Entry-type metadata for one member value (uses the Unnamed variant). */
export interface TypeInfo {
	e: EntryType;
	/** For StartOfArray members: per-element metadata. */
	elem?: (TypeInfo | undefined)[];
}

export interface OdinNode {
	$type: string | null;
	/** Present on reference nodes only. */
	$id?: number;
	/** Scalar entry-type metadata per member key; needed to re-serialize. */
	$types?: Record<string, TypeInfo>;
	[field: string]: unknown;
}

export interface OdinRef {
	$ref: number;
}

export interface OdinPrimitiveArray {
	$primitiveArray: true;
	bytesPerElement: number;
	/** Raw little-endian element data, a multiple of bytesPerElement long. */
	data: Uint8Array;
}

export type OdinValue =
	| OdinNode
	| OdinRef
	| OdinPrimitiveArray
	| OdinValue[]
	| string
	| number
	| bigint
	| boolean
	| null;

const META_KEYS = new Set(['$type', '$id', '$types', '$ref', '$primitiveArray']);
const ANON_KEY = /^\$\d+$/;

export function isNode(v: OdinValue): v is OdinNode {
	return (
		typeof v === 'object' &&
		v !== null &&
		!Array.isArray(v) &&
		!('$ref' in v) &&
		!('$primitiveArray' in v)
	);
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

interface Entry {
	name: string | null;
	value: OdinValue;
	info?: TypeInfo;
	end?: 'node' | 'array' | 'stream';
}

export class OdinBinaryReader {
	private pos = 0;
	private view: DataView;
	private types = new Map<number, string>();

	constructor(private buf: Uint8Array) {
		this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	}

	/**
	 * Parses the single root value of the stream (the game's
	 * `SerializationUtility.SerializeValue` writes exactly one).
	 */
	static parse(buf: Uint8Array): OdinValue {
		const reader = new OdinBinaryReader(buf);
		const { value, end } = reader.readEntry();
		if (end) throw new Error('odin: stream has no root value');
		if (reader.pos !== buf.length) {
			throw new Error(`odin: ${buf.length - reader.pos} trailing bytes after root value`);
		}
		return value;
	}

	private u8(): number {
		return this.buf[this.pos++];
	}
	private i16(): number {
		const v = this.view.getInt16(this.pos, true);
		this.pos += 2;
		return v;
	}
	private u16(): number {
		const v = this.view.getUint16(this.pos, true);
		this.pos += 2;
		return v;
	}
	private i32(): number {
		const v = this.view.getInt32(this.pos, true);
		this.pos += 4;
		return v;
	}
	private u32(): number {
		const v = this.view.getUint32(this.pos, true);
		this.pos += 4;
		return v;
	}
	private i64(): bigint {
		const v = this.view.getBigInt64(this.pos, true);
		this.pos += 8;
		return v;
	}
	private u64(): bigint {
		const v = this.view.getBigUint64(this.pos, true);
		this.pos += 8;
		return v;
	}
	private f32(): number {
		const v = this.view.getFloat32(this.pos, true);
		this.pos += 4;
		return v;
	}
	private f64(): number {
		const v = this.view.getFloat64(this.pos, true);
		this.pos += 8;
		return v;
	}

	/** Odin string: 1 byte charset flag (0 = 8-bit, 1 = UTF-16LE), i32 char count, chars. */
	private str(): string {
		const wide = this.u8();
		const len = this.i32();
		if (wide === 1) {
			const bytes = this.buf.subarray(this.pos, this.pos + len * 2);
			this.pos += len * 2;
			return new TextDecoder('utf-16le').decode(bytes);
		}
		const bytes = this.buf.subarray(this.pos, this.pos + len);
		this.pos += len;
		return new TextDecoder('latin1').decode(bytes);
	}

	/** Type reference: TypeName (id + string, first occurrence), TypeID (cached), or UnnamedNull. */
	private typeEntry(): string | null {
		const e = this.u8();
		if (e === EntryType.UnnamedNull) return null;
		if (e === EntryType.TypeName) {
			const id = this.i32();
			const name = this.str();
			this.types.set(id, name);
			return name;
		}
		if (e === EntryType.TypeID) {
			const id = this.i32();
			const name = this.types.get(id);
			if (name === undefined) throw new Error(`odin: unknown type id ${id} at ${this.pos - 5}`);
			return name;
		}
		throw new Error(`odin: bad type entry ${e} at offset ${this.pos - 1}`);
	}

	private guid(): string {
		// .NET Guid memory layout: i32, i16, i16 little-endian + 8 bytes
		const b = this.buf.subarray(this.pos, this.pos + 16);
		this.pos += 16;
		const hex = (i: number) => b[i].toString(16).padStart(2, '0');
		return (
			`${hex(3)}${hex(2)}${hex(1)}${hex(0)}-${hex(5)}${hex(4)}-${hex(7)}${hex(6)}-` +
			`${hex(8)}${hex(9)}-${hex(10)}${hex(11)}${hex(12)}${hex(13)}${hex(14)}${hex(15)}`
		);
	}

	private refNode(): OdinNode {
		const type = this.typeEntry();
		const id = this.i32();
		const node: OdinNode = { $type: type, $id: id };
		this.nodeBody(node);
		return node;
	}

	private structNode(): OdinNode {
		const type = this.typeEntry();
		const node: OdinNode = { $type: type };
		this.nodeBody(node);
		return node;
	}

	private nodeBody(node: OdinNode): void {
		let anon = 0;
		for (;;) {
			const { name, value, info, end } = this.readEntry();
			if (end === 'node') return;
			if (end) throw new Error(`odin: unexpected ${end} end inside node at ${this.pos}`);
			const key = name ?? `$${anon++}`;
			if (key in node) throw new Error(`odin: duplicate member '${key}' in node at ${this.pos}`);
			node[key] = value;
			if (info) (node.$types ??= {})[key] = info;
		}
	}

	private array(): { items: OdinValue[]; info?: TypeInfo } {
		const declaredLength = Number(this.i64());
		const items: OdinValue[] = [];
		const elem: (TypeInfo | undefined)[] = [];
		let hasElemInfo = false;
		for (;;) {
			const { value, info, end } = this.readEntry();
			if (end === 'array') break;
			if (end) throw new Error(`odin: unexpected ${end} end inside array at ${this.pos}`);
			items.push(value);
			elem.push(info);
			if (info) hasElemInfo = true;
		}
		if (items.length !== declaredLength) {
			throw new Error(`odin: array declared ${declaredLength} items but had ${items.length}`);
		}
		return {
			items,
			info: hasElemInfo ? { e: EntryType.StartOfArray, elem } : undefined
		};
	}

	private primitiveArray(): OdinPrimitiveArray {
		const length = this.i32();
		const bytesPerElement = this.i32();
		const data = this.buf.slice(this.pos, this.pos + length * bytesPerElement);
		this.pos += length * bytesPerElement;
		return { $primitiveArray: true, bytesPerElement, data };
	}

	private readEntry(): Entry {
		const e = this.u8() as EntryType;
		const name = isNamed(e) ? this.str() : null;
		const scalar = (value: OdinValue, unnamedType: EntryType): Entry => ({
			name,
			value,
			info: { e: unnamedType }
		});
		switch (e) {
			case EntryType.NamedStartOfReferenceNode:
			case EntryType.UnnamedStartOfReferenceNode:
				return { name, value: this.refNode() };
			case EntryType.NamedStartOfStructNode:
			case EntryType.UnnamedStartOfStructNode:
				return { name, value: this.structNode() };
			case EntryType.EndOfNode:
				return { name, value: null, end: 'node' };
			case EntryType.StartOfArray: {
				const { items, info } = this.array();
				return { name, value: items, info };
			}
			case EntryType.EndOfArray:
				return { name, value: null, end: 'array' };
			case EntryType.PrimitiveArray:
				return { name, value: this.primitiveArray() };
			case EntryType.NamedInternalReference:
			case EntryType.UnnamedInternalReference:
				return { name, value: { $ref: this.i32() } };
			case EntryType.NamedSByte:
			case EntryType.UnnamedSByte:
				return scalar((this.u8() << 24) >> 24, EntryType.UnnamedSByte);
			case EntryType.NamedByte:
			case EntryType.UnnamedByte:
				return scalar(this.u8(), EntryType.UnnamedByte);
			case EntryType.NamedShort:
			case EntryType.UnnamedShort:
				return scalar(this.i16(), EntryType.UnnamedShort);
			case EntryType.NamedUShort:
			case EntryType.UnnamedUShort:
				return scalar(this.u16(), EntryType.UnnamedUShort);
			case EntryType.NamedInt:
			case EntryType.UnnamedInt:
				return scalar(this.i32(), EntryType.UnnamedInt);
			case EntryType.NamedUInt:
			case EntryType.UnnamedUInt:
				return scalar(this.u32(), EntryType.UnnamedUInt);
			case EntryType.NamedLong:
			case EntryType.UnnamedLong:
				return scalar(this.i64(), EntryType.UnnamedLong);
			case EntryType.NamedULong:
			case EntryType.UnnamedULong:
				return scalar(this.u64(), EntryType.UnnamedULong);
			case EntryType.NamedFloat:
			case EntryType.UnnamedFloat:
				return scalar(this.f32(), EntryType.UnnamedFloat);
			case EntryType.NamedDouble:
			case EntryType.UnnamedDouble:
				return scalar(this.f64(), EntryType.UnnamedDouble);
			case EntryType.NamedChar:
			case EntryType.UnnamedChar:
				return scalar(String.fromCharCode(this.u16()), EntryType.UnnamedChar);
			case EntryType.NamedString:
			case EntryType.UnnamedString:
				return { name, value: this.str() };
			case EntryType.NamedGuid:
			case EntryType.UnnamedGuid:
				return scalar(this.guid(), EntryType.UnnamedGuid);
			case EntryType.NamedBoolean:
			case EntryType.UnnamedBoolean:
				return { name, value: this.u8() === 1 };
			case EntryType.NamedNull:
			case EntryType.UnnamedNull:
				return { name, value: null };
			case EntryType.EndOfStream:
				return { name, value: null, end: 'stream' };
			default:
				throw new Error(`odin: unhandled entry type ${e} at offset ${this.pos - 1}`);
		}
	}
}

function isNamed(e: EntryType): boolean {
	switch (e) {
		case EntryType.NamedStartOfReferenceNode:
		case EntryType.NamedStartOfStructNode:
		case EntryType.NamedInternalReference:
		case EntryType.NamedExternalReferenceByIndex:
		case EntryType.NamedExternalReferenceByGuid:
		case EntryType.NamedExternalReferenceByString:
		case EntryType.NamedSByte:
		case EntryType.NamedByte:
		case EntryType.NamedShort:
		case EntryType.NamedUShort:
		case EntryType.NamedInt:
		case EntryType.NamedUInt:
		case EntryType.NamedLong:
		case EntryType.NamedULong:
		case EntryType.NamedFloat:
		case EntryType.NamedDouble:
		case EntryType.NamedDecimal:
		case EntryType.NamedChar:
		case EntryType.NamedString:
		case EntryType.NamedGuid:
		case EntryType.NamedBoolean:
		case EntryType.NamedNull:
			return true;
		default:
			return false;
	}
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/** Maps an unnamed scalar entry type to its named counterpart (named = unnamed - 1). */
function withName(unnamedType: EntryType, named: boolean): EntryType {
	return named ? unnamedType - 1 : unnamedType;
}

export class OdinBinaryWriter {
	private buf = new Uint8Array(64 * 1024);
	private view = new DataView(this.buf.buffer);
	private pos = 0;
	private types = new Map<string, number>();

	/** Serializes a tree produced by `OdinBinaryReader.parse` back to bytes. */
	static write(root: OdinValue): Uint8Array {
		const writer = new OdinBinaryWriter();
		writer.value(null, root, undefined);
		return writer.buf.subarray(0, writer.pos);
	}

	private ensure(extra: number): void {
		if (this.pos + extra <= this.buf.length) return;
		let cap = this.buf.length * 2;
		while (cap < this.pos + extra) cap *= 2;
		const next = new Uint8Array(cap);
		next.set(this.buf.subarray(0, this.pos));
		this.buf = next;
		this.view = new DataView(next.buffer);
	}

	private u8(v: number): void {
		this.ensure(1);
		this.buf[this.pos++] = v;
	}
	private i16(v: number): void {
		this.ensure(2);
		this.view.setInt16(this.pos, v, true);
		this.pos += 2;
	}
	private u16(v: number): void {
		this.ensure(2);
		this.view.setUint16(this.pos, v, true);
		this.pos += 2;
	}
	private i32(v: number): void {
		this.ensure(4);
		this.view.setInt32(this.pos, v, true);
		this.pos += 4;
	}
	private u32(v: number): void {
		this.ensure(4);
		this.view.setUint32(this.pos, v, true);
		this.pos += 4;
	}
	private i64(v: bigint): void {
		this.ensure(8);
		this.view.setBigInt64(this.pos, v, true);
		this.pos += 8;
	}
	private u64(v: bigint): void {
		this.ensure(8);
		this.view.setBigUint64(this.pos, v, true);
		this.pos += 8;
	}
	private f32(v: number): void {
		this.ensure(4);
		this.view.setFloat32(this.pos, v, true);
		this.pos += 4;
	}
	private f64(v: number): void {
		this.ensure(8);
		this.view.setFloat64(this.pos, v, true);
		this.pos += 8;
	}
	private bytes(v: Uint8Array): void {
		this.ensure(v.length);
		this.buf.set(v, this.pos);
		this.pos += v.length;
	}

	/** Always UTF-16LE, like the game (CompressStringsTo8BitWhenPossible is never enabled). */
	private str(v: string): void {
		this.u8(1);
		this.i32(v.length);
		this.ensure(v.length * 2);
		for (let i = 0; i < v.length; i++) {
			this.view.setUint16(this.pos, v.charCodeAt(i), true);
			this.pos += 2;
		}
	}

	private typeRef(name: string | null): void {
		if (name === null) {
			this.u8(EntryType.UnnamedNull);
			return;
		}
		const cached = this.types.get(name);
		if (cached !== undefined) {
			this.u8(EntryType.TypeID);
			this.i32(cached);
			return;
		}
		const id = this.types.size;
		this.types.set(name, id);
		this.u8(EntryType.TypeName);
		this.i32(id);
		this.str(name);
	}

	private guid(v: string): void {
		const hex = v.replace(/-/g, '');
		if (hex.length !== 32) throw new Error(`odin: invalid guid '${v}'`);
		const b = new Uint8Array(16);
		for (let i = 0; i < 16; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		// canonical text -> .NET Guid memory layout
		this.bytes(
			new Uint8Array([
				b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6],
				b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
			])
		);
	}

	private entryHeader(name: string | null, unnamedType: EntryType): void {
		this.u8(withName(unnamedType, name !== null));
		if (name !== null) this.str(name);
	}

	private value(name: string | null, v: OdinValue, info: TypeInfo | undefined): void {
		if (v === null) {
			this.entryHeader(name, EntryType.UnnamedNull);
			return;
		}
		if (typeof v === 'boolean') {
			this.entryHeader(name, EntryType.UnnamedBoolean);
			this.u8(v ? 1 : 0);
			return;
		}
		if (typeof v === 'bigint') {
			const e = info?.e ?? EntryType.UnnamedLong;
			this.entryHeader(name, e);
			if (e === EntryType.UnnamedULong) this.u64(v);
			else this.i64(v);
			return;
		}
		if (typeof v === 'number') {
			if (!info) throw new Error(`odin: number member '${name}' has no $types entry-type metadata`);
			this.entryHeader(name, info.e);
			switch (info.e) {
				case EntryType.UnnamedSByte:
					this.u8(v & 0xff);
					break;
				case EntryType.UnnamedByte:
					this.u8(v);
					break;
				case EntryType.UnnamedShort:
					this.i16(v);
					break;
				case EntryType.UnnamedUShort:
					this.u16(v);
					break;
				case EntryType.UnnamedInt:
					this.i32(v);
					break;
				case EntryType.UnnamedUInt:
					this.u32(v);
					break;
				case EntryType.UnnamedFloat:
					this.f32(v);
					break;
				case EntryType.UnnamedDouble:
					this.f64(v);
					break;
				default:
					throw new Error(`odin: bad numeric entry type ${info.e} for member '${name}'`);
			}
			return;
		}
		if (typeof v === 'string') {
			if (info?.e === EntryType.UnnamedChar) {
				this.entryHeader(name, EntryType.UnnamedChar);
				this.u16(v.charCodeAt(0));
			} else if (info?.e === EntryType.UnnamedGuid) {
				this.entryHeader(name, EntryType.UnnamedGuid);
				this.guid(v);
			} else {
				this.entryHeader(name, EntryType.UnnamedString);
				this.str(v);
			}
			return;
		}
		if (Array.isArray(v)) {
			if (name !== null) throw new Error('odin: arrays are always unnamed members');
			this.u8(EntryType.StartOfArray);
			this.i64(BigInt(v.length));
			// elements added by an editor have no metadata; assume they are
			// shaped like the existing elements (homogeneous C# collections)
			const fallback = info?.elem?.find((x) => x !== undefined);
			for (let i = 0; i < v.length; i++) {
				this.value(null, v[i], info?.elem?.[i] ?? fallback);
			}
			this.u8(EntryType.EndOfArray);
			return;
		}
		if ('$primitiveArray' in v) {
			if (name !== null) throw new Error('odin: primitive arrays are always unnamed members');
			const arr = v as OdinPrimitiveArray;
			if (arr.data.length % arr.bytesPerElement !== 0) {
				throw new Error('odin: primitive array data length not a multiple of bytesPerElement');
			}
			this.u8(EntryType.PrimitiveArray);
			this.i32(arr.data.length / arr.bytesPerElement);
			this.i32(arr.bytesPerElement);
			this.bytes(arr.data);
			return;
		}
		if ('$ref' in v && typeof (v as OdinRef).$ref === 'number') {
			this.entryHeader(name, EntryType.UnnamedInternalReference);
			this.i32((v as OdinRef).$ref);
			return;
		}
		this.node(name, v as OdinNode);
	}

	private node(name: string | null, node: OdinNode): void {
		const isRef = node.$id !== undefined;
		this.entryHeader(
			name,
			isRef ? EntryType.UnnamedStartOfReferenceNode : EntryType.UnnamedStartOfStructNode
		);
		this.typeRef(node.$type ?? null);
		if (isRef) this.i32(node.$id as number);
		const types = node.$types ?? {};
		for (const key of Object.keys(node)) {
			if (META_KEYS.has(key)) continue;
			const memberName = ANON_KEY.test(key) ? null : key;
			this.value(memberName, node[key] as OdinValue, types[key]);
		}
		this.u8(EntryType.EndOfNode);
	}
}
