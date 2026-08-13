import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import {
	getScrollRestorationInlineScript,
	getStoredScrollY,
	parseSavedScrollPositions,
	scrollRestorationInlineScriptCspHash,
	scrollRestorationStorageKey,
	serializeSavedScrollPositions,
} from './router-scroll-restoration.ts'

test('sessionStorage scroll positions restore the saved Y for the current history key', () => {
	const stored = serializeSavedScrollPositions({
		'scroll-key-1': 2000,
		'scroll-key-2': 3400,
	})
	expect(JSON.parse(stored)).toEqual({
		'scroll-key-1': 2000,
		'scroll-key-2': 3400,
	})

	const positions = parseSavedScrollPositions(stored)
	expect(getStoredScrollY(positions, 'scroll-key-1')).toBe(2000)
	expect(getStoredScrollY(positions, 'scroll-key-2')).toBe(3400)
	expect(getStoredScrollY(positions, 'missing-key')).toBeNull()
	expect(getStoredScrollY(positions, null)).toBeNull()
	expect(parseSavedScrollPositions(null)).toEqual({})
	expect(parseSavedScrollPositions('[{"not":"rr-format"}]')).toEqual({})

	const restoreScript = getScrollRestorationInlineScript()
	expect(restoreScript).toContain(JSON.stringify(scrollRestorationStorageKey))
	expect(restoreScript).toContain('sessionStorage.getItem')
	expect(restoreScript).toContain('window.history.state.key')
	expect(restoreScript).toContain('window.scrollTo(0,storedY)')
	expect(restoreScript).toContain('scrollRestoration')
	expect(restoreScript).toContain('"manual"')
	expect(scrollRestorationInlineScriptCspHash).toBe(
		`'sha256-${createHash('sha256').update(restoreScript, 'utf8').digest('base64')}'`,
	)
})
