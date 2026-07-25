/**
 * Typed views over the rundata tree — the current run's stats and shared
 * resources. Mutations go straight into the parsed nodes.
 */

import type { OdinNode, OdinValue } from './odin';
import { listItems, type ResourcePair } from './tree';

export interface RunStats {
	totalRunTime: number;
	killedBossCount: number;
	killedEnemyCount: number;
	unlockedShopCount: number;
}

export function runStats(rundata: OdinNode): RunStats {
	return rundata as unknown as RunStats;
}

/** rundata.sharedResources is a Dictionary<string, float>; pairs are {$k, $v} nodes. */
export function getResources(rundata: OdinNode): ResourcePair[] {
	return listItems(rundata.sharedResources as OdinValue) as unknown as ResourcePair[];
}
