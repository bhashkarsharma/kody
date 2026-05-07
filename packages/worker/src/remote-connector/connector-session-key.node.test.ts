import { expect, test } from 'vitest'
import {
	connectorIngressPath,
	connectorSessionKey,
	parseConnectorRoutePath,
} from './connector-session-key.ts'

test('connectorSessionKey prefixes connector ids with kind', () => {
	expect(connectorSessionKey('home', 'default')).toBe('home:default')
	expect(connectorSessionKey('HOME', 'living-room')).toBe('home:living-room')
	expect(connectorSessionKey('custom', 'alpha')).toBe('custom:alpha')
})

test('parseConnectorRoutePath handles connector paths', () => {
	expect(parseConnectorRoutePath('/connectors/custom/my-id/snapshot')).toEqual({
		kind: 'custom',
		instanceId: 'my-id',
		rest: '/snapshot',
	})
	expect(
		parseConnectorRoutePath('/connectors/home/default/rpc/tools-list'),
	).toEqual({
		kind: 'home',
		instanceId: 'default',
		rest: '/rpc/tools-list',
	})
	expect(parseConnectorRoutePath('/connectors/home/default')).toEqual({
		kind: 'home',
		instanceId: 'default',
		rest: '',
	})
	expect(parseConnectorRoutePath('/connectors/home')).toBeNull()
})

test('connectorIngressPath creates connector URLs', () => {
	expect(connectorIngressPath('home', 'default')).toBe(
		'/connectors/home/default',
	)
	expect(connectorIngressPath('custom', 'a b')).toBe('/connectors/custom/a%20b')
})
