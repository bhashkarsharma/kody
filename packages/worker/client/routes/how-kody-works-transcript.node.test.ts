import { expect, test } from 'vitest'
import {
	howKodyWorksPackageFiles,
	howKodyWorksTranscriptActs,
} from './how-kody-works-transcript.ts'

test('factory transcript covers ask, invoke, and a quiet daily email', () => {
	expect(howKodyWorksTranscriptActs.map((act) => act.id)).toEqual([
		'ask',
		'invoke',
	])

	const tools = howKodyWorksTranscriptActs.flatMap((act) =>
		act.lines.flatMap((line) => (line.role === 'tools' ? line.tools : [])),
	)
	expect(tools.some((tool) => tool.name === 'search')).toBe(true)
	expect(tools.some((tool) => tool.name === 'execute')).toBe(true)
	expect(tools.some((tool) => tool.name === 'package_save')).toBe(true)
	expect(
		tools.some((tool) => tool.hints.some((hint) => hint.kind === 'memory')),
	).toBe(true)

	const agentLines = howKodyWorksTranscriptActs.flatMap((act) =>
		act.lines.flatMap((line) => (line.role === 'agent' ? [line.text] : [])),
	)
	expect(
		agentLines.some((text) => /no webhook/i.test(text) && /cron/i.test(text)),
	).toBe(true)

	expect(howKodyWorksPackageFiles['src/daily-digest.ts']).toContain(
		'email_send',
	)
	expect(howKodyWorksPackageFiles['src/daily-digest.ts']).toContain(
		'shipped.length === 0',
	)
	expect(howKodyWorksPackageFiles['package.json']).toContain('"enabled": false')
	expect(howKodyWorksPackageFiles['README.md']).toContain('## Intent')
})
