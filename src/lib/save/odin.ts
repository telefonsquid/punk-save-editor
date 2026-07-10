/**
 * Reader for the Odin Serializer binary format (Sirenix.Serialization,
 * DataFormat.Binary) used by PUNK for most save files.
 *
 * Parses the byte stream into a generic JSON-like tree. Object nodes carry
 * `$type` (assembly-qualified C# type name) and, for reference nodes, `$id`
 * so internal references (`$ref`) can be resolved and the file re-serialized.
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

export interface OdinNode {
	$type: string | null;
	/** Present on reference nodes only. */
	$id?: number;
	[field: string]: unknown;
}

export interface OdinRef {
	$ref: number;
}

export interface OdinPrimitiveArray {
	$primitiveArray: true;
	bytesPerElement: number;
	/** Raw little-endian element data, length * bytesPerElement bytes. */
	data: Uint8Array;
	length: number;
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

interface Entry {
	name: string | null;
	value: OdinValue;
	end?: 'node' | 'array' | 'stream';
}

export class OdinBinaryReader {
	private pos = 0;
	private view: DataView;
	private types = new Map<number, string>();

	constructor(private buf: Uint8Array) {
		this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	}

	/** Parses the single root value of the stream. */
	static parse(buf: Uint8Array): OdinValue {
		const reader = new OdinBinaryReader(buf);
		const { value, end } = reader.readEntry();
		if (end) throw new Error('odin: stream has no root value');
		return value;
	}

	get bytesRead(): number {
		return this.pos;
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

	/** Odin string: 1 byte charset flag (0 = 8-bit, 1 = UTF-16LE), int32 char count, chars. */
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
		// .NET Guid layout: int32, int16, int16 little-endian + 8 bytes
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
		return { $type: type, $id: id, ...this.nodeBody() };
	}

	private structNode(): OdinNode {
		const type = this.typeEntry();
		return { $type: type, ...this.nodeBody() };
	}

	private nodeBody(): Record<string, OdinValue> {
		const obj: Record<string, OdinValue> = {};
		let anon = 0;
		for (;;) {
			const { name, value, end } = this.readEntry();
			if (end === 'node') return obj;
			if (end) throw new Error(`odin: unexpected ${end} end inside node at ${this.pos}`);
			obj[name ?? `$${anon++}`] = value;
		}
	}

	private array(): OdinValue[] {
		const declaredLength = Number(this.i64());
		const items: OdinValue[] = [];
		for (;;) {
			const { value, end } = this.readEntry();
			if (end === 'array') break;
			if (end) throw new Error(`odin: unexpected ${end} end inside array at ${this.pos}`);
			items.push(value);
		}
		if (items.length !== declaredLength) {
			throw new Error(`odin: array declared ${declaredLength} items but had ${items.length}`);
		}
		return items;
	}

	private primitiveArray(): OdinPrimitiveArray {
		const length = this.i32();
		const bytesPerElement = this.i32();
		const data = this.buf.slice(this.pos, this.pos + length * bytesPerElement);
		this.pos += length * bytesPerElement;
		return { $primitiveArray: true, length, bytesPerElement, data };
	}

	private readEntry(): Entry {
		const e = this.u8() as EntryType;
		const name = isNamed(e) ? this.str() : null;
		switch (e) {
			case EntryType.NamedStartOfReferenceNode:
			case EntryType.UnnamedStartOfReferenceNode:
				return { name, value: this.refNode() };
			case EntryType.NamedStartOfStructNode:
			case EntryType.UnnamedStartOfStructNode:
				return { name, value: this.structNode() };
			case EntryType.EndOfNode:
				return { name, value: null, end: 'node' };
			case EntryType.StartOfArray:
				return { name, value: this.array() };
			case EntryType.EndOfArray:
				return { name, value: null, end: 'array' };
			case EntryType.PrimitiveArray:
				return { name, value: this.primitiveArray() };
			case EntryType.NamedInternalReference:
			case EntryType.UnnamedInternalReference:
				return { name, value: { $ref: this.i32() } };
			case EntryType.NamedSByte:
			case EntryType.UnnamedSByte:
				return { name, value: (this.u8() << 24) >> 24 };
			case EntryType.NamedByte:
			case EntryType.UnnamedByte:
				return { name, value: this.u8() };
			case EntryType.NamedShort:
			case EntryType.UnnamedShort:
				return { name, value: this.i16() };
			case EntryType.NamedUShort:
			case EntryType.UnnamedUShort:
				return { name, value: this.u16() };
			case EntryType.NamedInt:
			case EntryType.UnnamedInt:
				return { name, value: this.i32() };
			case EntryType.NamedUInt:
			case EntryType.UnnamedUInt:
				return { name, value: this.u32() };
			case EntryType.NamedLong:
			case EntryType.UnnamedLong:
				return { name, value: this.i64() };
			case EntryType.NamedULong:
			case EntryType.UnnamedULong:
				return { name, value: this.u64() };
			case EntryType.NamedFloat:
			case EntryType.UnnamedFloat:
				return { name, value: this.f32() };
			case EntryType.NamedDouble:
			case EntryType.UnnamedDouble:
				return { name, value: this.f64() };
			case EntryType.NamedChar:
			case EntryType.UnnamedChar:
				return { name, value: String.fromCharCode(this.u16()) };
			case EntryType.NamedString:
			case EntryType.UnnamedString:
				return { name, value: this.str() };
			case EntryType.NamedGuid:
			case EntryType.UnnamedGuid:
				return { name, value: this.guid() };
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
