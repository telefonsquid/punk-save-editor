/**
 * Minimal ZIP writer (store / no compression). Used by the browser
 * upload-download fallback (io.ts) to hand a user their edited save files back
 * in browsers that can't write folders in place (Firefox, Safari). Save files
 * are already LZF-compressed, so deflate would not shrink them.
 */

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function concat(chunks: Uint8Array[]): Uint8Array {
	let len = 0;
	for (const c of chunks) len += c.length;
	const out = new Uint8Array(len);
	let o = 0;
	for (const c of chunks) {
		out.set(c, o);
		o += c.length;
	}
	return out;
}

export interface ZipEntry {
	name: string;
	data: Uint8Array;
}

/** Builds a ZIP archive (stored entries) from the given files. */
export function makeZip(entries: ZipEntry[]): Uint8Array {
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const { name, data } of entries) {
		const nameBytes = enc.encode(name);
		const crc = crc32(data);

		const lh = new DataView(new ArrayBuffer(30));
		lh.setUint32(0, 0x04034b50, true); // local file header signature
		lh.setUint16(4, 20, true); // version needed
		lh.setUint16(6, 0, true); // flags
		lh.setUint16(8, 0, true); // method: store
		lh.setUint16(10, 0, true); // mod time
		lh.setUint16(12, 0x21, true); // mod date: 1980-01-01
		lh.setUint32(14, crc, true);
		lh.setUint32(18, data.length, true); // compressed size
		lh.setUint32(22, data.length, true); // uncompressed size
		lh.setUint16(26, nameBytes.length, true);
		lh.setUint16(28, 0, true); // extra length
		const localHeader = new Uint8Array(lh.buffer);
		parts.push(localHeader, nameBytes, data);

		const ch = new DataView(new ArrayBuffer(46));
		ch.setUint32(0, 0x02014b50, true); // central directory header signature
		ch.setUint16(4, 20, true); // version made by
		ch.setUint16(6, 20, true); // version needed
		ch.setUint16(8, 0, true); // flags
		ch.setUint16(10, 0, true); // method: store
		ch.setUint16(12, 0, true); // mod time
		ch.setUint16(14, 0x21, true); // mod date
		ch.setUint32(16, crc, true);
		ch.setUint32(20, data.length, true);
		ch.setUint32(24, data.length, true);
		ch.setUint16(28, nameBytes.length, true);
		ch.setUint16(30, 0, true); // extra length
		ch.setUint16(32, 0, true); // comment length
		ch.setUint16(34, 0, true); // disk number start
		ch.setUint16(36, 0, true); // internal attributes
		ch.setUint32(38, 0, true); // external attributes
		ch.setUint32(42, offset, true); // local header offset
		central.push(new Uint8Array(ch.buffer), nameBytes);

		offset += localHeader.length + nameBytes.length + data.length;
	}

	const centralStart = offset;
	const centralBytes = concat(central);

	const eocd = new DataView(new ArrayBuffer(22));
	eocd.setUint32(0, 0x06054b50, true); // end of central directory signature
	eocd.setUint16(4, 0, true); // disk number
	eocd.setUint16(6, 0, true); // central dir start disk
	eocd.setUint16(8, entries.length, true); // entries on this disk
	eocd.setUint16(10, entries.length, true); // total entries
	eocd.setUint32(12, centralBytes.length, true); // central dir size
	eocd.setUint32(16, centralStart, true); // central dir offset
	eocd.setUint16(20, 0, true); // comment length

	return concat([...parts, centralBytes, new Uint8Array(eocd.buffer)]);
}
