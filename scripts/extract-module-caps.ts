/**
 * Step 2 of regenerating src/lib/save/module-caps.json: decodes the Odin
 * binary payloads dumped by extract-module-caps.py into each module's
 * ModifyResourceCapacity effects (what the editor needs to compute a ship's
 * max resource values).
 *
 *     bun scripts/extract-module-caps.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OdinBinaryReader, isNode } from '../src/lib/save/odin';
import type { OdinNode, OdinValue } from '../src/lib/save/odin';

const here = fileURLToPath(new URL('.', import.meta.url));
const raw = JSON.parse(readFileSync(`${here}/module-effects-raw.json`, 'utf8'));

interface RawModule {
	name: string;
	level: number;
	canBeBoosted: boolean;
	bytes: string;
	refs: { name: string | null; id: string | null }[];
}

interface CapEffect {
	resource: string;
	base: number;
	method: 'add' | 'mul';
	change: number;
}

const modules: Record<string, { level: number; canBeBoosted: boolean; caps: CapEffect[] }> = {};

for (const [guid, mod] of Object.entries(raw.modules as Record<string, RawModule>)) {
	const bytes = Uint8Array.from(atob(mod.bytes), (c) => c.charCodeAt(0));
	const root = OdinBinaryReader.parseMembers(bytes);
	const effectsList = root.effects;
	const items: OdinValue[] =
		isNode(effectsList) && Array.isArray(effectsList.$0) ? effectsList.$0 : [];
	const caps: CapEffect[] = [];
	for (const eff of items) {
		if (!isNode(eff)) continue;
		if (eff.$type?.split(',')[0] !== 'ModifyResourceCapacity') continue;
		const res = eff.resource;
		const delta = eff.delta as OdinNode;
		let resourceId: string | null = null;
		if (res && typeof res === 'object' && '$ext' in res && typeof res.$ext === 'number') {
			resourceId = mod.refs[res.$ext]?.id ?? mod.refs[res.$ext]?.name ?? null;
		}
		if (!resourceId || !isNode(delta)) {
			throw new Error(`${mod.name}: unresolvable capacity effect`);
		}
		caps.push({
			resource: resourceId,
			base: (delta.baseValue as number) ?? 0,
			method: delta.increaseMethod === 1 || delta.increaseMethod === 'Multiply' ? 'mul' : 'add',
			change: (delta.change as number) ?? 0
		});
	}
	modules[guid] = { level: mod.level, canBeBoosted: mod.canBeBoosted, caps };
}

const slotLevelDeltas: Record<string, number> = {};
for (const [id, st] of Object.entries(raw.slotTypes as Record<string, { levelDelta: number }>)) {
	if (st.levelDelta) slotLevelDeltas[id] = st.levelDelta;
}

writeFileSync(
	`${here}/../src/lib/save/module-caps.json`,
	JSON.stringify({ modules, slotLevelDeltas }, null, 1)
);
console.log(
	`wrote module-caps.json: ${Object.keys(modules).length} modules ` +
		`(${Object.values(modules).filter((m) => m.caps.length).length} with capacity effects)`
);
