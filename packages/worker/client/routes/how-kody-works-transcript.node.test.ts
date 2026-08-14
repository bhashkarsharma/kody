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
			tool.inputs.some((input) =>
				input.value.includes('package_get_git_remote'),
			),
		),
	).toBe(true)
	expect(
		tools.some((tool) =>
			tool.inputs.some((input) =>
				input.value.includes('package_publish_external_push'),
			),
		),
	).toBe(true)
	expect(
		tools.every((tool) =>
			tool.inputs.every((input) => !input.value.includes('package_save')),
		),
	).toBe(true)
	expect(
		tools.some((tool) =>
			tool.inputs.some((input) => input.value.includes('repo_open_session')),
		),
	).toBe(true)
	expect(
		tools.some((tool) =>
			tool.inputs.some((input) => input.value.includes('repo_edit_files')),
		),
	).toBe(true)
	expect(
		tools.some((tool) =>
			tool.inputs.some((input) =>
				input.value.includes('kody:@you/kody-bot-shipped/whatShipped'),
			),
		),
	).toBe(true)
	expect(
		tools.every((tool) =>
			tool.inputs.every((input) => !input.value.includes('packages.invoke')),
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
	const fileLines = howKodyWorksTranscriptActs.flatMap((act) =>
		act.lines.flatMap((line) => (line.role === 'files' ? [line] : [])),
	)
	expect(fileLines.length).toBeGreaterThan(0)
	expect(
		fileLines.every(
			(line) => line.note.trim().length > 0 && line.files.length > 0,
		),
	).toBe(true)
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
	expect(githubSearch?.result).toContain('## Relevant memories')
	expect(
		githubSearch?.inputs.some((input) => input.name === 'memoryContext'),
	).toBe(true)
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
				tool.name === 'search' && tool.result.includes('## Relevant memories'),
		),
	).toBe(true)
	expect(
		tools
			.filter((tool) => tool.name === 'execute')
			.every((tool) => !tool.result.includes('## Relevant memories')),
	).toBe(true)

	const askLines = howKodyWorksTranscriptActs.find(
		(act) => act.id === 'ask',
	)?.lines
	const firstUser = askLines?.find((line) => line.role === 'user')
	expect(firstUser && 'text' in firstUser ? firstUser.text : '').toBe(
		'What did my favorite bot ship recently on GitHub?',
	)
	const phoneUser = howKodyWorksTranscriptActs
		.find((act) => act.id === 'invoke')
		?.lines.find((line) => line.role === 'user')
	expect(phoneUser && 'text' in phoneUser ? phoneUser.text : '').toBe(
		'Anything interesting shipped by my favorite bot recently?',
	)
	const phoneSearch = howKodyWorksTranscriptActs
		.find((act) => act.id === 'invoke')
		?.lines.flatMap((line) => (line.role === 'tools' ? line.tools : []))
		.find((tool) => tool.name === 'search')
	expect(
		phoneSearch?.inputs.some(
			(input) => input.name === 'query' && input.value.includes('interesting'),
		),
	).toBe(true)
	expect(
		phoneSearch?.inputs.some(
			(input) =>
				input.name === 'memoryContext' &&
				input.value.includes(
					'Anything interesting shipped by my favorite bot recently?',
				),
		),
	).toBe(true)
	const firstReasoning = askLines?.find(
		(line) => line.role === 'agent' && line.tone === 'reasoning',
	)
	expect(
		firstReasoning && 'text' in firstReasoning ? firstReasoning.text : '',
	).not.toMatch(/kody-bot/i)

	const agentLines = howKodyWorksTranscriptActs.flatMap((act) =>
		act.lines.flatMap((line) => (line.role === 'agent' ? [line.text] : [])),
	)
	expect(
		agentLines.some((text) => /webhook/i.test(text) && /cron/i.test(text)),
	).toBe(true)
	expect(
		howKodyWorksTranscriptActs
			.find((act) => act.id === 'invoke')
			?.lines.some(
				(line) =>
					line.role === 'tools' &&
					line.tools.some((tool) =>
						tool.inputs.some(
							(input) =>
								input.name === 'query' &&
								input.value.includes('notify when github user ships'),
						),
					),
			),
	).toBe(true)

	expect(howKodyWorksPackageFiles['src/daily-digest.ts']).toContain(
		'email_send',
	)
	expect(howKodyWorksPackageFiles['src/daily-digest.ts']).toContain(
		'shipped.length === 0',
	)
	expect(howKodyWorksPackageFiles['package.json']).toContain('"enabled": true')
	expect(howKodyWorksPackageFiles['README.md']).toContain('## Intent')

	const askFiles = howKodyWorksTranscriptActs
		.find((act) => act.id === 'ask')
		?.lines.find((line) => line.role === 'files')
	expect(askFiles && 'files' in askFiles ? askFiles.files : []).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ path: 'src/what-shipped.ts' }),
			expect.objectContaining({ path: 'package.json' }),
			expect.objectContaining({ path: 'README.md' }),
		]),
	)
	expect(
		askFiles && 'files' in askFiles
			? askFiles.files.every((file) => file.path !== 'src/daily-digest.ts')
			: false,
	).toBe(true)
	expect(
		howKodyWorksTranscriptActs
			.find((act) => act.id === 'ask')
			?.lines.flatMap((line) => (line.role === 'tools' ? line.tools : []))
			.every((tool) =>
				tool.inputs.every((input) => !input.value.includes('package_save')),
			),
	).toBe(true)

	expect(
		howKodyWorksTranscriptActs
			.find((act) => act.id === 'invoke')
			?.lines.every((line) => line.role !== 'files'),
	).toBe(true)

	const invokeEditCode = howKodyWorksTranscriptActs
		.find((act) => act.id === 'invoke')
		?.lines.flatMap((line) => (line.role === 'tools' ? line.tools : []))
		.filter((tool) =>
			tool.inputs.some((input) => input.value.includes('repo_edit_files')),
		)
		.flatMap((tool) =>
			tool.inputs
				.filter((input) => input.name === 'code')
				.map((input) => input.value),
		)
	expect(
		invokeEditCode?.some((code) => code.includes('"enabled": false')),
	).toBe(true)
	expect(invokeEditCode?.some((code) => code.includes('"enabled": true'))).toBe(
		true,
	)
	expect(
		invokeEditCode?.every((code) => !code.includes('src/what-shipped.ts\n')),
	).toBe(true)
})
