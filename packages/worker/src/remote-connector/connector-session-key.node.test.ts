import { expect, test } from 'vitest'
import {
	connectorIngressPath,
	connectorSessionKey,
	parseConnectorRoutePath,
} from './connector-session-key.ts'

test('connectorSessionKey prefixes connector ids with kind', () => {
	expect(connectorSessionKey('lights', 'default')).toBe('lights:default')
	expect(connectorSessionKey('LIGHTS', 'living-room')).toBe(
		'lights:living-room',
	)
	expect(connectorSessionKey('custom', 'alpha')).toBe('custom:alpha')
})

test('parseConnectorRoutePath handles connector paths', () => {
	expect(parseConnectorRoutePath('/connectors/custom/my-id/snapshot')).toEqual({
		kind: 'custom',
		instanceId: 'my-id',
		rest: '/snapshot',
	})
	expect(
		parseConnectorRoutePath('/connectors/lights/default/rpc/tools-list'),
	).toEqual({
		kind: 'lights',
		instanceId: 'default',
		rest: '/rpc/tools-list',
	})
	expect(parseConnectorRoutePath('/connectors/lights/default')).toEqual({
		kind: 'lights',
		instanceId: 'default',
		rest: '',
	})
	expect(parseConnectorRoutePath('/connectors/lights')).toBeNull()
})

test('connectorIngressPath creates connector URLs', () => {
	expect(connectorIngressPath('lights', 'default')).toBe(
		'/connectors/lights/default',
	)
	expect(connectorIngressPath('custom', 'a b')).toBe('/connectors/custom/a%20b')
})
