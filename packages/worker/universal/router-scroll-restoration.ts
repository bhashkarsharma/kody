/**
 * Scroll restoration storage and the pre-hydration restore script.
 *
 * Mirrors React Router's `<ScrollRestoration />`: positions are a
 * `{ [historyKey]: y }` map in sessionStorage, and an inline script in the
 * SSR body applies `window.scrollTo` before paint so a refresh does not flash
 * the top of the page.
 */

export const scrollRestorationStorageKey = 'kody:router-scroll-positions'

/** History state field React Router uses (`window.history.state.key`). */
export const historyStateScrollKey = 'key'

export type SavedScrollPositions = Record<string, number>

export function parseSavedScrollPositions(
	raw: string | null,
): SavedScrollPositions {
	if (!raw) return {}
	try {
		const parsed: unknown = JSON.parse(raw)
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return {}
		}
		const positions: SavedScrollPositions = {}
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === 'number') {
				positions[key] = value
			}
		}
		return positions
	} catch {
		return {}
	}
}

export function serializeSavedScrollPositions(
	positions: SavedScrollPositions,
): string {
	return JSON.stringify(positions)
}

export function getStoredScrollY(
	positions: SavedScrollPositions,
	historyKey: string | null | undefined,
): number | null {
	if (!historyKey) return null
	const storedY = positions[historyKey]
	return typeof storedY === 'number' ? storedY : null
}

/**
 * Blocking classic script inlined in the SSR body. Keep this a string (not a
 * function that references `window`) so `#universal` stays DOM-free. The body
 * matches React Router's restore IIFE, plus `manual` scroll restoration so
 * the browser does not undo the pre-paint scroll.
 *
 * CSP allows this exact source via `scrollRestorationInlineScriptCspHash`.
 * Update the hash in the same change if you edit the script (the node test
 * fails when they drift).
 */
export const scrollRestorationInlineScript = `(function(storageKey,restoreKey){if("scrollRestoration"in window.history){window.history.scrollRestoration="manual"}if(!window.history.state||!window.history.state.key){var key=Math.random().toString(32).slice(2);window.history.replaceState({key:key},"")}try{var positions=JSON.parse(sessionStorage.getItem(storageKey)||"{}");var storedY=positions[restoreKey||window.history.state.key];if(typeof storedY==="number"){window.scrollTo(0,storedY)}}catch(error){console.error(error);sessionStorage.removeItem(storageKey)}})(${JSON.stringify(scrollRestorationStorageKey)},null)`

export function getScrollRestorationInlineScript() {
	return scrollRestorationInlineScript
}

/**
 * `script-src` hash for `scrollRestorationInlineScript`. The node test
 * recomputes this so the CSP entry cannot drift from the inlined source.
 */
export const scrollRestorationInlineScriptCspHash =
	"'sha256-MdxEgAksnpE4HJeHgjidW/x9g+OeXkea+EM+60WWso0='"
