import { expect, test } from 'vitest'
import { normalizeRemoteConnectorRefs } from '@kody-internal/shared/remote-connectors.ts'

test('normalizeRemoteConnectorRefs returns empty when remoteConnectors unset', () => {
	expect(
		normalizeRemoteConnectorRefs({
			remoteConnectors: undefined,
		}),
	).toEqual([])
})

test('normalizeRemoteConnectorRefs normalizes remoteConnectors when provided', () => {
	expect(
		normalizeRemoteConnectorRefs({
			remoteConnectors: [
				{ kind: 'Lights', instanceId: '  a  ' },
				{ kind: 'custom', instanceId: 'x' },
			],
		}),
	).toEqual([
		{ kind: 'lights', instanceId: 'a' },
		{ kind: 'custom', instanceId: 'x' },
	])
})

test('normalizeRemoteConnectorRefs preserves an empty connector list', () => {
	expect(
		normalizeRemoteConnectorRefs({
			remoteConnectors: [],
		}),
	).toEqual([])
})
