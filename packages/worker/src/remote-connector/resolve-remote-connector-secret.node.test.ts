import { expect, test } from 'vitest'
import { resolveRemoteConnectorSharedSecret } from './resolve-remote-connector-secret.ts'

test('REMOTE_CONNECTOR_SECRETS resolves by kind and instance', () => {
	const env = {
		REMOTE_CONNECTOR_SECRETS: {
			'custom:alpha': 'alpha-secret',
			'home:default': 'home-secret',
		},
	} as Env
	expect(resolveRemoteConnectorSharedSecret('custom', 'alpha', env)).toBe(
		'alpha-secret',
	)
	expect(resolveRemoteConnectorSharedSecret('home', 'default', env)).toBe(
		'home-secret',
	)
})

test('returns undefined when the map does not contain the connector key', () => {
	expect(
		resolveRemoteConnectorSharedSecret('custom', 'alpha', {
			REMOTE_CONNECTOR_SECRETS: {
				'home:default': 'home-secret',
			},
		} as Env),
	).toBeUndefined()
})
