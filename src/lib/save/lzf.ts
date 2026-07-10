/**
 * LZF compression, compatible with the CLZF2 implementation used by PUNK
 * (see `CLZF2.Compress`/`Decompress` in Punk.Main.dll).
 *
 * Save files are raw LZF streams with no header; the game sizes the output
 * buffer by doubling until decompression fits, and so do we.
 */

const MAX_LIT = 32;
const MAX_OFF = 8192;
const MAX_REF = 264;
const HLOG = 14;
const HSIZE = 1 << HLOG;

export function lzfDecompress(input: Uint8Array): Uint8Array {
	let outLen = input.length * 2;
	for (;;) {
		const out = new Uint8Array(outLen);
		const n = tryDecompress(input, out);
		if (n > 0) return out.subarray(0, n);
		outLen *= 2;
	}
}

function tryDecompress(input: Uint8Array, output: Uint8Array): number {
	const inLen = input.length;
	const outCap = output.length;
	let ip = 0;
	let op = 0;
	do {
		const ctrl = input[ip++];
		if (ctrl < 32) {
			// literal run of ctrl+1 bytes
			let run = ctrl + 1;
			if (op + run > outCap) return 0;
			do {
				output[op++] = input[ip++];
			} while (--run !== 0);
		} else {
			// back reference
			let len = ctrl >> 5;
			let ref = op - ((ctrl & 0x1f) << 8) - 1;
			if (len === 7) len += input[ip++];
			ref -= input[ip++];
			if (op + len + 2 > outCap) return 0;
			if (ref < 0) throw new Error('lzf: invalid back reference (corrupt stream?)');
			output[op++] = output[ref++];
			output[op++] = output[ref++];
			do {
				output[op++] = output[ref++];
			} while (--len !== 0);
		}
	} while (ip < inLen);
	return op;
}

export function lzfCompress(input: Uint8Array): Uint8Array {
	// worst case: every MAX_LIT bytes cost 1 control byte, plus slack
	const out = new Uint8Array(Math.ceil(input.length * 1.1) + 64);
	const n = tryCompress(input, out);
	return out.subarray(0, n);
}

function hash(v: number): number {
	return ((v ^ (v << 5)) >> ((3 * 8 - HLOG - v * 5) & 31)) & (HSIZE - 1);
}

function tryCompress(input: Uint8Array, output: Uint8Array): number {
	const inLen = input.length;
	const hashTable = new Int32Array(HSIZE).fill(-1);
	let ip = 0;
	let op = 0;
	let lit = 0;
	if (inLen === 0) return 0;
	let hval = (input[0] << 8) | input[1];

	for (;;) {
		if (ip < inLen - 2) {
			hval = ((hval << 8) | input[ip + 2]) >>> 0;
			const slot = hash(hval);
			const ref = hashTable[slot];
			hashTable[slot] = ip;
			const off = ip - ref - 1;
			if (
				ref >= 0 &&
				off < MAX_OFF &&
				ip + 4 < inLen &&
				ref > 0 &&
				input[ref] === input[ip] &&
				input[ref + 1] === input[ip + 1] &&
				input[ref + 2] === input[ip + 2]
			) {
				let len = 2;
				const maxLen = Math.min(inLen - ip - len, MAX_REF);
				do {
					len++;
				} while (len < maxLen && input[ref + len] === input[ip + len]);

				// flush pending literals
				if (lit !== 0) {
					output[op++] = lit - 1;
					for (let i = ip - lit; i < ip; i++) output[op++] = input[i];
					lit = 0;
				}

				const encLen = len - 2;
				ip++;
				if (encLen < 7) {
					output[op++] = (off >> 8) + (encLen << 5);
				} else {
					output[op++] = (off >> 8) + 0xe0;
					output[op++] = encLen - 7;
				}
				output[op++] = off & 0xff;

				ip += encLen - 1;
				hval = ((input[ip] << 8) | input[ip + 1]) >>> 0;
				hval = ((hval << 8) | input[ip + 2]) >>> 0;
				hashTable[hash(hval)] = ip;
				ip++;
				hval = ((hval << 8) | input[ip + 2]) >>> 0;
				hashTable[hash(hval)] = ip;
				ip++;
				continue;
			}
		} else if (ip === inLen) {
			break;
		}

		lit++;
		ip++;
		if (lit === MAX_LIT) {
			output[op++] = MAX_LIT - 1;
			for (let i = ip - lit; i < ip; i++) output[op++] = input[i];
			lit = 0;
		}
	}

	if (lit !== 0) {
		output[op++] = lit - 1;
		for (let i = ip - lit; i < ip; i++) output[op++] = input[i];
	}
	return op;
}
