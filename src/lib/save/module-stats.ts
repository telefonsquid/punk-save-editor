/**
 * Turns a module's decoded effects and weapon data into the short stat lines the
 * editor prints under its name — the "+40 max Fuel" / "1 per shot" numbers the
 * game shows on a module card.
 *
 * Effects are evaluated at the module's own asset level, which is the level it
 * has sitting in the vault. On the ship grid a neighbouring booster raises that
 * (see `sumGridEffects` in slot.ts), so these are the unboosted figures.
 *
 * A `resource` on a line means the UI draws that resource's HUD icon instead of
 * spelling its name out — the game labels these with icons too.
 */
import {
	moduleEffects,
	moduleInfo,
	moduleLevel,
	seriesAt,
	type ModuleEffectInfo
} from './slot';

export interface StatLine {
	label: string;
	value: string;
	/** Resource id whose icon replaces a written-out name. */
	resource?: string | null;
	/** Trailing text after the resource icon ("per shot"). */
	suffix?: string;
}

/** Compact number: no trailing `.0`, at most two decimals. */
export function fmtStat(v: number): string {
	const r = Math.round(v * 100) / 100;
	return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
}

function signed(v: number): string {
	return v > 0 ? `+${fmtStat(v)}` : fmtStat(v);
}

function magnitude(effect: ModuleEffectInfo, levelIndex: number): number {
	return effect.series ? seriesAt(effect.series, levelIndex) : 0;
}

function effectLine(effect: ModuleEffectInfo, levelIndex: number): StatLine | null {
	const amount = magnitude(effect, levelIndex);
	switch (effect.kind) {
		case 'capacity':
			return { label: 'Max', value: signed(amount), resource: effect.resource };
		case 'regen':
			return { label: 'Regen', value: `${signed(amount)}/s`, resource: effect.resource };
		case 'drain':
			return { label: 'Drains', value: `${fmtStat(amount)}/s`, resource: effect.resource };
		case 'shield':
			return { label: 'Shield', value: `${fmtStat(amount)}x`, resource: effect.resource };
		case 'weaponProperty': {
			const target = String(effect.extra?.targetProperty ?? 'Weapon');
			// An `add` of 1 reads "+1"; a `mul` of 1.5 reads "x1.5".
			const value = effect.extra?.operation === 'mul' ? `x${fmtStat(amount)}` : signed(amount);
			return { label: target, value };
		}
		case 'explosion':
			return { label: 'Explosion', value: `${fmtStat(amount)} dmg`, resource: effect.resource };
		case 'burn':
			return { label: 'Burn', value: fmtStat(amount) };
		case 'discharge':
			return { label: 'Chain', value: `${fmtStat(amount)} dmg`, resource: effect.resource };
		default:
			return null;
	}
}

export function moduleStats(id: string | null | undefined): StatLine[] {
	const lines: StatLine[] = [];
	const levelIndex = Math.max(0, moduleLevel(id) - 1);

	const weapon = moduleInfo(id)?.weapon;
	if (weapon) {
		if (weapon.damage) {
			lines.push({ label: 'Damage', value: fmtStat(weapon.damage), resource: weapon.damageType });
		}
		if (weapon.fireRate) lines.push({ label: 'Fire rate', value: `${fmtStat(weapon.fireRate)}/s` });
		if (weapon.cost) {
			lines.push({
				label: 'Cost',
				value: fmtStat(weapon.cost),
				resource: weapon.costResource,
				suffix: 'per shot'
			});
		}
		if (weapon.projectileCount) {
			lines.push({ label: 'Projectiles', value: fmtStat(weapon.projectileCount) });
		}
		if (weapon.burstSize) lines.push({ label: 'Burst', value: fmtStat(weapon.burstSize) });
	}

	for (const effect of moduleEffects(id)) {
		const line = effectLine(effect, levelIndex);
		if (line) lines.push(line);
		// The augment effects charge a per-shot cost on top of their own number.
		if (effect.cost?.amount) {
			lines.push({
				label: 'Cost',
				value: fmtStat(effect.cost.amount),
				resource: effect.cost.resource,
				suffix: 'per shot'
			});
		}
	}
	return lines;
}
