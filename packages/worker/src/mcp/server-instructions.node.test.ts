import { expect, test } from 'vitest'
import { buildMcpServerInstructions } from './server-instructions.ts'

test('includes connected remote connector summaries in server instructions', () => {
	const instructions = buildMcpServerInstructions({
		remoteConnectors: [
			{
				name: 'home/default',
				domain: 'remote:home:default',
				description: 'Local-network home automation for lights and media.',
			},
		],
	})

	expect(instructions).toContain('Connected remote connectors')
	expect(instructions).toContain(
		'- `home/default` (`remote:home:default`): Local-network home automation for lights and media.',
	)
})

test('keeps remote connector descriptions compact', () => {
	const instructions = buildMcpServerInstructions({
		remoteConnectors: [
			{
				name: 'home/default',
				domain: 'remote:home:default',
				description: 'a'.repeat(300),
			},
		],
	})

	expect(instructions).toContain(`${'a'.repeat(237)}...`)
	expect(instructions).not.toContain('a'.repeat(300))
})
