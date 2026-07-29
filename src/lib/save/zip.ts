/**
 * The editor's ZIP reader and writer. Two callers: the full-folder backups
 * (`backup.ts`) and the browser upload-download fallback (`io.ts`).
 *
 * Written from scratch rather than pulled in, because the format the editor
 * needs is the small classic one — no zip64, no encryption, two compression
 * methods — and the platform already ships the only hard part. `CompressionStream`
 * does the deflating, so this file is headers and a CRC.
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

/** Stored, and deflate. Anything else in an archive is refused by name. */
const STORE = 0;
const DEFLATE = 8;

const METHOD_NAMES: Record<number, string> = {
	1: 'shrink',
	6: 'implode',
	9: 'deflate64',
	12: 'bzip2',
	14: 'LZMA',
	93: 'zstd',
	95: 'xz',
	98: 'PPMd'
};

/**
 * A save folder is ~12 MB, of which `world` alone is 10 — and it deflates to
 * about two thirds, which is worth having when backups accumulate. The Odin
 * files barely move (they are LZF-compressed already), so each entry keeps
 * whichever of the two came out smaller rather than paying for a method that
 * lost.
 */
async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
	if (typeof CompressionStream === 'undefined' || data.length === 0) return null;
	try {
		const stream = new Blob([data as BlobPart])
			.stream()
			.pipeThrough(new CompressionStream('deflate-raw'));
		const packed = new Uint8Array(await new Response(stream).arrayBuffer());
		return packed.length < data.length ? packed : null;
	} catch {
		// An engine without deflate-raw stores instead; a stored zip is still a zip.
		return null;
	}
}

async function inflate(data: Uint8Array, name: string): Promise<Uint8Array> {
	if (typeof DecompressionStream === 'undefined') {
		throw new Error(`'${name}' is compressed and this browser cannot decompress it`);
	}
	const stream = new Blob([data as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** MS-DOS date and time, the only clock a classic zip header has room for. */
function dosStamp(date: Date): { time: number; date: number } {
	// Before 1980 there is nothing to encode; the epoch itself is the convention.
	if (date.getFullYear() < 1980) return { time: 0, date: 0x21 };
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
		date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
	};
}

/**
 * Builds a ZIP archive from the given files, deflating whatever shrinks.
 *
 * `modified` is stamped on every entry so an archive extracted by hand carries
 * a believable date. It is the moment the archive was taken, not the mtime of
 * each file — a `SaveDir` reports names and bytes, not timestamps, and the whole
 * point of a save folder is that its files are one moment anyway.
 */
export async function makeZip(entries: ZipEntry[], modified = new Date()): Promise<Uint8Array> {
	const enc = new TextEncoder();
	const stamp = dosStamp(modified);
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const { name, data } of entries) {
		const nameBytes = enc.encode(name);
		const crc = crc32(data);
		const packed = await deflate(data);
		const body = packed ?? data;
		const method = packed ? DEFLATE : STORE;

		const lh = new DataView(new ArrayBuffer(30));
		lh.setUint32(0, 0x04034b50, true); // local file header signature
		lh.setUint16(4, 20, true); // version needed
		lh.setUint16(6, 0, true); // flags
		lh.setUint16(8, method, true);
		lh.setUint16(10, stamp.time, true);
		lh.setUint16(12, stamp.date, true);
		lh.setUint32(14, crc, true);
		lh.setUint32(18, body.length, true); // compressed size
		lh.setUint32(22, data.length, true); // uncompressed size
		lh.setUint16(26, nameBytes.length, true);
		lh.setUint16(28, 0, true); // extra length
		const localHeader = new Uint8Array(lh.buffer);
		parts.push(localHeader, nameBytes, body);

		const ch = new DataView(new ArrayBuffer(46));
		ch.setUint32(0, 0x02014b50, true); // central directory header signature
		ch.setUint16(4, 20, true); // version made by
		ch.setUint16(6, 20, true); // version needed
		ch.setUint16(8, 0, true); // flags
		ch.setUint16(10, method, true);
		ch.setUint16(12, stamp.time, true);
		ch.setUint16(14, stamp.date, true);
		ch.setUint32(16, crc, true);
		ch.setUint32(20, body.length, true);
		ch.setUint32(24, data.length, true);
		ch.setUint16(28, nameBytes.length, true);
		ch.setUint16(30, 0, true); // extra length
		ch.setUint16(32, 0, true); // comment length
		ch.setUint16(34, 0, true); // disk number start
		ch.setUint16(36, 0, true); // internal attributes
		ch.setUint32(38, 0, true); // external attributes
		ch.setUint32(42, offset, true); // local header offset
		central.push(new Uint8Array(ch.buffer), nameBytes);

		offset += localHeader.length + nameBytes.length + body.length;
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

/** Walks back from the end of the file to the end-of-central-directory record. */
function findEocd(view: DataView): number {
	// The record is 22 bytes plus a comment of up to 64 KB, and nothing may
	// follow it — so it starts somewhere in the last 64 KB + 22.
	const earliest = Math.max(0, view.byteLength - 0xffff - 22);
	for (let i = view.byteLength - 22; i >= earliest; i--) {
		if (view.getUint32(i, true) === 0x06054b50) return i;
	}
	return -1;
}

/**
 * Reads an archive back into its files.
 *
 * The entries are read through the **central directory** rather than by walking
 * the local headers, because that is the copy a zip writer is allowed to fill in
 * after the fact: a stream-written entry sets flag bit 3 and leaves the sizes in
 * its local header at zero, with the real ones in a trailing data descriptor.
 * The central directory always carries them.
 *
 * Deliberately tolerant of archives this app did not write — the restore list
 * happily takes a zip made by the file manager, which is how most people's
 * backups exist. Deliberately intolerant of the ones it cannot honour: an
 * encrypted, zip64 or exotically compressed entry throws by name instead of
 * being silently skipped, since a half-restored save folder is worse than none.
 */
export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocd = findEocd(view);
	if (eocd < 0) throw new Error('not a zip archive');

	const count = view.getUint16(eocd + 10, true);
	let at = view.getUint32(eocd + 16, true);
	// 0xffff/0xffffffff in the EOCD is the zip64 marker: the real values live in
	// a record this reader does not parse. Only archives past 4 GB or 65535 files
	// get there, which no save folder can reach.
	if (count === 0xffff || at === 0xffffffff) throw new Error('zip64 archives are not supported');

	const dec = new TextDecoder();
	const out: ZipEntry[] = [];

	for (let i = 0; i < count; i++) {
		if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) {
			throw new Error('the archive index is damaged');
		}
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const crc = view.getUint32(at + 16, true);
		const packedSize = view.getUint32(at + 20, true);
		const size = view.getUint32(at + 24, true);
		const nameLen = view.getUint16(at + 28, true);
		const extraLen = view.getUint16(at + 30, true);
		const commentLen = view.getUint16(at + 32, true);
		const localAt = view.getUint32(at + 42, true);
		// Bit 11 says the name is UTF-8. Without it the name is officially
		// CP437, but every writer that matters here means UTF-8 anyway, and the
		// names in a save folder are ASCII either way.
		const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
		at += 46 + nameLen + extraLen + commentLen;

		// A directory entry is a name ending in `/` with no content. Nothing to
		// restore, and the folder it names is created by writing the files under it.
		if (name.endsWith('/')) continue;
		if (flags & 1) throw new Error(`'${name}' is encrypted`);
		if (method !== STORE && method !== DEFLATE) {
			throw new Error(`'${name}' uses ${METHOD_NAMES[method] ?? `method ${method}`} compression`);
		}

		// The local header repeats the name and carries its own extra field,
		// whose length is free to differ from the central copy's — so the data
		// offset has to be read from the local header rather than assumed.
		if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== 0x04034b50) {
			throw new Error(`'${name}' points at a damaged header`);
		}
		const start =
			localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
		if (start + packedSize > bytes.length) throw new Error(`'${name}' is truncated`);

		const raw = bytes.subarray(start, start + packedSize);
		const data = method === DEFLATE ? await inflate(raw, name) : raw;
		if (data.length !== size) throw new Error(`'${name}' did not unpack to its recorded size`);
		if (crc32(data) !== crc) throw new Error(`'${name}' fails its checksum — the archive is corrupt`);
		out.push({ name, data });
	}

	return out;
}
