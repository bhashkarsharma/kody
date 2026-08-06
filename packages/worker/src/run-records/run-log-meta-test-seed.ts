import type { RunLog } from './run-log-do.ts'

type RunLogMetaMutator = {
	setMeta(key: string, value: number): void
}

/**
 * Seed `run_log_meta` through the DO write path so in-isolate counter caches
 * stay coherent. Raw SQL inserts bypass `setMeta` and leave stale memos.
 */
export function seedRunLogMeta(
	instance: RunLog,
	input: {
		finishesSinceRetention?: number
		runCount?: number
	},
) {
	const meta = instance as unknown as RunLogMetaMutator
	if (typeof input.finishesSinceRetention === 'number') {
		meta.setMeta('finishes_since_retention', input.finishesSinceRetention)
	}
	if (typeof input.runCount === 'number') {
		meta.setMeta('run_count', input.runCount)
	}
}
