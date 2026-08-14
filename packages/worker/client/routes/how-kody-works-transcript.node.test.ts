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
	expect(
		tools.some((tool) =>
			tool.inputs.some((input) => input.value.includes('package_save')),
		),
	).toBe(true)
	expect(
		tools.some((tool) =>
			tool.inputs.some((input) => input.value.includes('coding_guide_get')),
		),
	).toBe(true)
	expect(
		tools.every((tool) => tool.name === 'search' || tool.name === 'execute'),
	).toBe(true)
	expect(tools.every((tool) => tool.result.trim().length > 0)).toBe(true)
	expect(tools.every((tool) => tool.note.trim().length > 0)).toBe(true)
	expect(
		tools.every((tool) =>
			tool.inputs.every((input) => input.value.trim().length > 0),
		),
	).toBe(true)
	expect(
		tools
			.filter((tool) => tool.name === 'execute')
			.every((tool) => tool.inputs.some((input) => input.name === 'code')),
	).toBe(true)
	expect(
		tools.some((tool) =>
			tool.inputs.some(
				(input) => input.name === 'params' && input.value.includes('"files"'),
			),
		),
	).toBe(true)
	expect(tools.some((tool) => tool.name.startsWith('meta_memory_'))).toBe(false)
	expect(
		tools
			.filter((tool) => tool.name === 'execute')
			.every((tool) =>
				tool.inputs.some((input) => input.name === 'memoryContext'),
			),
	).toBe(true)
	expect(
		tools
			.filter((tool) => tool.name === 'search')
			.every((tool) => {
				const isEntityDetail = tool.inputs.some(
					(input) => input.name === 'entity',
				)
				return isEntityDetail
					? tool.result.includes('# Capability —')
					: tool.result.includes('# Search results')
			}),
	).toBe(true)
	const askSearches = howKodyWorksTranscriptActs
		.find((act) => act.id === 'ask')
		?.lines.flatMap((line) => (line.role === 'tools' ? line.tools : []))
		.filter((tool) => tool.name === 'search')
	expect(
		askSearches?.some((tool) =>
			tool.result.includes('githubAccessToken:secret'),
		),
	).toBe(true)
	expect(
		askSearches?.some((tool) =>
			tool.result.includes('coding_guide_get:capability'),
		),
	).toBe(true)
	expect(
		askSearches?.some((tool) =>
			tool.inputs.some(
				(input) =>
					input.name === 'entity' &&
					input.value.includes('coding_guide_get:capability'),
			),
		),
	).toBe(true)
	const githubSearch = askSearches?.find((tool) =>
		tool.result.includes('githubAccessToken:secret'),
	)
	expect(githubSearch?.result).not.toContain('github:integration')
	expect(githubSearch?.result).not.toContain('github:package')
	expect(githubSearch?.result).not.toMatch(/\*\*capability\*\* `execute`/)
	expect(howKodyWorksPackageFiles['src/what-shipped.ts']).toContain(
		"Authorization: 'Bearer {{secret:githubAccessToken}}'",
	)
	expect(
		tools
			.filter((tool) => tool.name === 'execute')
			.every((tool) => tool.result.startsWith('conversationId: ')),
	).toBe(true)
	expect(
		tools.some(
			(tool) =>
				tool.name === 'execute' && tool.result.includes('## Relevant memories'),
		),
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
