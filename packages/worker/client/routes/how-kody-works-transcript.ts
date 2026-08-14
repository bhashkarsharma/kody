export type TranscriptInput = {
	name: string
	kind: 'query' | 'code' | 'memory'
	lang?: string
	value: string
}

export type TranscriptTool = {
	name: string
	summary: string
	note: string
	inputs: Array<TranscriptInput>
	resultLang?: string
	result: string
}

export type TranscriptLine =
	| { role: 'user'; text: string }
	| { role: 'agent'; text: string }
	| { role: 'tools'; tools: Array<TranscriptTool> }

export type TranscriptAct = {
	id: string
	kicker: string
	title: string
	lines: Array<TranscriptLine>
}

export const howKodyWorksPackageFiles = {
	'package.json': `{
  "name": "@you/kody-bot-shipped",
  "private": true,
  "exports": {
    "./whatShipped": "./src/what-shipped.ts",
    "./daily-digest": "./src/daily-digest.ts"
  },
  "kody": {
    "id": "kody-bot-shipped",
    "description": "What kody-bot shipped since you last asked.",
    "jobs": {
      "daily-digest": {
        "entry": "./src/daily-digest.ts",
        "schedule": { "type": "cron", "expression": "0 8 * * *" },
        "timezone": "America/Denver",
        "enabled": false
      }
    }
  }
}`,
	'README.md': `# kody-bot-shipped

## Intent

Tell me what kody-bot shipped — published releases and new public repos —
since I last asked. Email me only when that list is not empty.
`,
	'src/what-shipped.ts': `import { packageStorage } from 'kody:runtime'

const login = 'kody-bot'
const seenKey = 'lastSeenEventId'

export default async function whatShipped() {
	const storage = packageStorage()
	const sinceId = (await storage.get(seenKey)) as string | null
	const shipped = await listShipped(sinceId)
	if (shipped[0]) await storage.set(seenKey, shipped[0].id)
	return shipped.length === 0
		? { shipped, message: 'Nothing new.' }
		: { shipped, message: shipped.map((item) => item.title).join('\\n') }
}

async function listShipped(sinceId: string | null) {
	const response = await fetch(
		\`https://api.github.com/users/\${login}/events/public\`,
		{
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: 'Bearer {{secret:githubAccessToken}}',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		},
	)
	if (!response.ok) throw new Error(\`GitHub \${response.status}\`)
	const events = (await response.json()) as Array<{
		id: string
		type: string
		repo: { name: string }
		payload: {
			action?: string
			ref_type?: string
			release?: { tag_name?: string }
		}
	}>
	const shipped = []
	for (const event of events) {
		if (sinceId && event.id === sinceId) break
		if (
			event.type === 'ReleaseEvent' &&
			event.payload.action === 'published'
		) {
			shipped.push({
				id: event.id,
				kind: 'release',
				title: \`\${event.repo.name} \${event.payload.release?.tag_name ?? 'release'}\`,
			})
		}
		if (
			event.type === 'CreateEvent' &&
			event.payload.ref_type === 'repository'
		) {
			shipped.push({
				id: event.id,
				kind: 'repository',
				title: \`New repo \${event.repo.name}\`,
			})
		}
	}
	return shipped
}
`,
	'src/daily-digest.ts': `import { kody } from 'kody:runtime'
import whatShipped from './what-shipped.ts'

export default async function dailyDigest() {
	const result = await whatShipped()
	if (result.shipped.length === 0) return { emailed: false }
	await kody.email_send({
		subject:
			result.shipped.length === 1
				? 'kody-bot shipped something'
				: \`kody-bot shipped \${result.shipped.length} things\`,
		text: result.message,
	})
	return { emailed: true, count: result.shipped.length }
}
`,
} as const

const fetchShipsCode = `export default async function main() {
	const response = await fetch(
		'https://api.github.com/users/kody-bot/events/public',
		{
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: 'Bearer {{secret:githubAccessToken}}',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		},
	)
	if (!response.ok) throw new Error(\`GitHub \${response.status}\`)
	const events = await response.json()
	return events.flatMap((event) => {
		if (
			event.type === 'ReleaseEvent' &&
			event.payload.action === 'published'
		) {
			return [{
				id: event.id,
				kind: 'release',
				title: \`\${event.repo.name} \${event.payload.release.tag_name}\`,
			}]
		}
		if (
			event.type === 'CreateEvent' &&
			event.payload.ref_type === 'repository'
		) {
			return [{
				id: event.id,
				kind: 'repository',
				title: \`New repo \${event.repo.name}\`,
			}]
		}
		return []
	})
}`

const invokeWhatShippedCode = `import { packages } from 'kody:runtime'

export default async function main() {
	return await packages.invoke({
		kodyId: 'kody-bot-shipped',
		exportName: './whatShipped',
	})
}`

const invokeDailyDigestCode = `import { packages } from 'kody:runtime'

export default async function main() {
	return await packages.invoke({
		kodyId: 'kody-bot-shipped',
		exportName: './daily-digest',
	})
}`

const loadGuidesCode = `import { kody } from 'kody:runtime'

export default async function main() {
	const authoring = await kody.coding_guide_get({
		guide: 'package_authoring',
	})
	const lifecycle = await kody.coding_guide_get({
		guide: 'package_lifecycle',
	})
	return { authoring, lifecycle }
}`

const savePackageCode = `import { kody } from 'kody:runtime'

export default async function main(input = {}) {
	return await kody.package_save(input)
}`

function packageSaveFiles(jobEnabled: boolean) {
	const packageJson = jobEnabled
		? howKodyWorksPackageFiles['package.json'].replace(
				'"enabled": false',
				'"enabled": true',
			)
		: howKodyWorksPackageFiles['package.json']
	return [
		{ path: 'package.json', content: packageJson },
		{ path: 'README.md', content: howKodyWorksPackageFiles['README.md'] },
		{
			path: 'src/what-shipped.ts',
			content: howKodyWorksPackageFiles['src/what-shipped.ts'],
		},
		{
			path: 'src/daily-digest.ts',
			content: howKodyWorksPackageFiles['src/daily-digest.ts'],
		},
	]
}

function jsonInput(value: unknown) {
	return JSON.stringify(value, null, 2)
}

const askMemoryContext = {
	task: 'What did kody-bot ship recently on GitHub?',
	entities: ['kody-bot'],
}

const watchLoginMemory = {
	subject: 'GitHub login I watch',
	summary: 'kody-bot is the GitHub user whose public shipping I ask about.',
}

function memoryContextInput() {
	return {
		name: 'memoryContext',
		kind: 'memory' as const,
		lang: 'json',
		value: jsonInput(askMemoryContext),
	}
}

const askConversationId = '3k7n2p9q4r8w'
const phoneConversationId = '5h8m2q7t1v4x'

function conversationIdInput(conversationId: string) {
	return {
		name: 'conversationId',
		kind: 'query' as const,
		lang: 'json',
		value: jsonInput(conversationId),
	}
}

const conversationIdReturnNote =
	'Tool conversation id; pass it back on subsequent search/execute calls.'

function conversationIdReturn(conversationId: string) {
	return `conversationId: ${conversationId}\n${conversationIdReturnNote}`
}

function searchTextReturn(input: { conversationId: string; body: string }) {
	return `${conversationIdReturn(input.conversationId)}\n\n${input.body}`
}

function executeTextReturn(input: {
	conversationId: string
	value: unknown
	memories?: Array<{ subject: string; summary: string }>
}) {
	const parts = [
		conversationIdReturn(input.conversationId),
		'',
		jsonInput(input.value),
	]
	if (input.memories && input.memories.length > 0) {
		parts.push('', '## Relevant memories', '')
		for (const memory of input.memories) {
			parts.push(`- **${memory.subject}** — ${memory.summary}`)
		}
	}
	return parts.join('\n')
}

const githubSearchMarkdown = `# Search results

For full detail on entity-backed hits, call \`search\` with \`entity: "{id}:{type}"\`.

1. **secret** \`githubAccessToken\` — github OAuth access token. Entity: \`githubAccessToken:secret\``

const codingGuideSearchMarkdown = `# Search results

For full detail on entity-backed hits, call \`search\` with \`entity: "{id}:{type}"\`.

1. **capability** \`coding_guide_get\` (\`coding\`) — Load an official Kody guide (markdown, bundled from the kody repository). Prefer this capability plus \`search\` results over local repo spelunking when Kody auth or integration behavior is already documented. Entity: \`coding_guide_get:capability\`
   \`kody.coding_guide_get(args)\` — \`type CodingGuideGetInput = { guide: "what_is_kody" | "quick_example" | "first_win" | "package_authoring" | "package_lifecycle" | ... }\`; use entity detail for the full definition`

const codingGuideDetailMarkdown = `# Capability — \`coding_guide_get\`

Load an official Kody guide (markdown, bundled from the kody repository).
Use \`guide: "package_authoring"\` for package creation or material package updates.
Use \`guide: "package_lifecycle"\` to choose reuse vs a new durable package, and before enabling package-owned schedules.

## Summary

- Entity: \`coding_guide_get:capability\`
- Domain: \`coding\`
- Required input fields: \`guide\`

## Execute from \`execute\`

\`\`\`ts
import { kody } from 'kody:runtime'

export default async function main(input = {}) {
	return await kody.coding_guide_get(input)
}
\`\`\`
`

const packageSearchMarkdown = `# Search results

For full detail on entity-backed hits, call \`search\` with \`entity: "{id}:{type}"\`.

1. **package** @you/kody-bot-shipped (\`kody-bot-shipped\`) — What kody-bot shipped since you last asked. Entity: \`kody-bot-shipped:package\``

export const howKodyWorksTranscriptActs: Array<TranscriptAct> = [
	{
		id: 'ask',
		kicker: 'Example of a conversation you might have with your agent.',
		title: 'Ask once',
		lines: [
			{
				role: 'user',
				text: 'What did kody-bot ship recently on GitHub?',
			},
			{
				role: 'agent',
				text: 'I will use your GitHub token to read kody-bot’s public activity.',
			},
			{
				role: 'tools',
				tools: [
					{
						name: 'search',
						summary: 'Find a saved GitHub token for user activity',
						note: 'Search returns secret metadata, never the token. The conversationId is minted here so later calls in this chat stay cheap.',
						inputs: [
							{
								name: 'query',
								kind: 'query',
								lang: 'json',
								value: jsonInput('github user activity'),
							},
						],
						resultLang: 'md',
						result: searchTextReturn({
							conversationId: askConversationId,
							body: githubSearchMarkdown,
						}),
					},
					{
						name: 'execute',
						summary:
							'Fetch public events with the saved token and keep only real ships',
						note: 'The module never sees the token. Authorization gets a secret placeholder, filled in only for approved hosts. memoryContext is why kody-bot shows up under Relevant memories.',
						inputs: [
							{
								name: 'code',
								kind: 'code',
								lang: 'ts',
								value: fetchShipsCode,
							},
							conversationIdInput(askConversationId),
							memoryContextInput(),
						],
						resultLang: 'md',
						result: executeTextReturn({
							conversationId: askConversationId,
							value: [
								{
									id: '51284920123',
									kind: 'release',
									title: 'kody-bot/lantern v1.4.0',
								},
								{
									id: '51279004401',
									kind: 'repository',
									title: 'New repo kody-bot/quiet-days',
								},
							],
							memories: [watchLoginMemory],
						}),
					},
				],
			},
			{
				role: 'agent',
				text: 'Two things since the last look: kody-bot/lantern v1.4.0, and a new public repo kody-bot/quiet-days.',
			},
			{
				role: 'user',
				text: 'Make this a package I can ask again.',
			},
			{
				role: 'agent',
				text: 'I will load the package authoring guides, then save the filter as an export you own, with a daily wrapper left off until we test it.',
			},
			{
				role: 'tools',
				tools: [
					{
						name: 'search',
						summary: 'Find the official package authoring guides',
						note: 'domain: coding ranks official guides. That is how the agent finds coding_guide_get instead of inventing a package shape.',
						inputs: [
							{
								name: 'query',
								kind: 'query',
								lang: 'json',
								value: jsonInput('package authoring lifecycle'),
							},
							{
								name: 'domain',
								kind: 'query',
								lang: 'json',
								value: jsonInput('coding'),
							},
							conversationIdInput(askConversationId),
						],
						resultLang: 'md',
						result: searchTextReturn({
							conversationId: askConversationId,
							body: codingGuideSearchMarkdown,
						}),
					},
					{
						name: 'search',
						summary: 'Open coding_guide_get for the guide ids',
						note: 'Entity detail is the full card. It names package_authoring and package_lifecycle — the two guides this save needs.',
						inputs: [
							{
								name: 'entity',
								kind: 'query',
								lang: 'json',
								value: jsonInput('coding_guide_get:capability'),
							},
							conversationIdInput(askConversationId),
						],
						resultLang: 'md',
						result: searchTextReturn({
							conversationId: askConversationId,
							body: codingGuideDetailMarkdown,
						}),
					},
					{
						name: 'execute',
						summary: 'Load the package authoring and lifecycle guides',
						note: 'Guides are bundled markdown from the Kody repo. The agent reads them in execute, then follows them.',
						inputs: [
							{
								name: 'code',
								kind: 'code',
								lang: 'ts',
								value: loadGuidesCode,
							},
							conversationIdInput(askConversationId),
							memoryContextInput(),
						],
						resultLang: 'md',
						result: executeTextReturn({
							conversationId: askConversationId,
							value: {
								authoring: {
									title: 'Package authoring',
									body: '# Package authoring\n\nCreate a complete UTF-8 package with a README Intent section.',
								},
								lifecycle: {
									title: 'Package lifecycle',
									body: '# Package lifecycle\n\nLoad this before enabling a package-owned schedule.',
								},
							},
						}),
					},
					{
						name: 'execute',
						summary: 'Write the owned package: export, cursor, quiet job',
						note: 'The ad hoc filter becomes a package you own: a callable export, a cursor in packageStorage, and a daily job left off until it is tested.',
						inputs: [
							{
								name: 'code',
								kind: 'code',
								lang: 'ts',
								value: savePackageCode,
							},
							{
								name: 'params',
								kind: 'code',
								lang: 'json',
								value: jsonInput({ files: packageSaveFiles(false) }),
							},
							conversationIdInput(askConversationId),
							memoryContextInput(),
						],
						resultLang: 'md',
						result: executeTextReturn({
							conversationId: askConversationId,
							value: {
								package_id: 'pkg_kody_bot_shipped',
								kody_id: 'kody-bot-shipped',
								name: '@you/kody-bot-shipped',
								description: 'What kody-bot shipped since you last asked.',
								tags: [],
								has_app: false,
								hidden: false,
								source_id: 'src_kody_bot_shipped',
								created_at: '2026-08-13T14:52:00.000Z',
								updated_at: '2026-08-13T14:52:00.000Z',
								pending_secret_package_approvals: null,
								next_steps:
									'Coding agents with local filesystem/git access should use the git lane for further edits instead of re-sending full file sets: call package_get_git_remote({ kody_id: "kody-bot-shipped" }), run the returned setup_commands to clone into a temporary directory, edit and push normally, then publish with package_publish_external_push. Binary assets and multi-file refactors are only supported through that git lane. Tool-only agents without local git can continue with package_save or repo sessions.',
							},
						}),
					},
				],
			},
			{
				role: 'agent',
				text: 'You now have `kody-bot-shipped`. Ask again from any agent and I will invoke the export instead of walking GitHub by hand.',
			},
		],
	},
	{
		id: 'invoke',
		kicker: 'Later, on your phone',
		title: 'Ask again, cheaper',
		lines: [
			{
				role: 'user',
				text: 'What did kody-bot ship recently on GitHub?',
			},
			{
				role: 'agent',
				text: 'I already have a package for that.',
			},
			{
				role: 'tools',
				tools: [
					{
						name: 'search',
						summary: 'Find the owned package, not a new GitHub walk',
						note: 'A new conversation on the phone. Search finds the owned package instead of walking GitHub again.',
						inputs: [
							{
								name: 'query',
								kind: 'query',
								lang: 'json',
								value: jsonInput('kody-bot shipped'),
							},
						],
						resultLang: 'md',
						result: searchTextReturn({
							conversationId: phoneConversationId,
							body: packageSearchMarkdown,
						}),
					},
					{
						name: 'execute',
						summary: 'Invoke the export — no model rewriting the filter',
						note: 'packages.invoke runs the export as written. No model rewrites the filter. The memory comes back because this conversation is new.',
						inputs: [
							{
								name: 'code',
								kind: 'code',
								lang: 'ts',
								value: invokeWhatShippedCode,
							},
							conversationIdInput(phoneConversationId),
							memoryContextInput(),
						],
						resultLang: 'md',
						result: executeTextReturn({
							conversationId: phoneConversationId,
							value: {
								shipped: [],
								message: 'Nothing new.',
							},
							memories: [watchLoginMemory],
						}),
					},
				],
			},
			{
				role: 'agent',
				text: 'Nothing new since v1.4.0 and quiet-days.',
			},
			{
				role: 'user',
				text: 'Update me when kody-bot does something.',
			},
			{
				role: 'agent',
				text: 'GitHub has no webhook for one person’s public activity, so a daily cron is the fit. I will turn on the wrapper we already wrote — it emails you only when the list is not empty.',
			},
			{
				role: 'tools',
				tools: [
					{
						name: 'execute',
						summary: 'Test the no-argument wrapper the scheduler will call',
						note: 'The wrapper takes no arguments so a cron can call it. shipped is empty, so emailed is false — quiet on purpose.',
						inputs: [
							{
								name: 'code',
								kind: 'code',
								lang: 'ts',
								value: invokeDailyDigestCode,
							},
							conversationIdInput(phoneConversationId),
							memoryContextInput(),
						],
						resultLang: 'md',
						result: executeTextReturn({
							conversationId: phoneConversationId,
							value: { emailed: false },
						}),
					},
					{
						name: 'execute',
						summary: 'Enable the daily job after the wrapper succeeds',
						note: 'Enable the schedule only after the wrapper has been invoked once. After this, mornings are a job, not a prompt.',
						inputs: [
							{
								name: 'code',
								kind: 'code',
								lang: 'ts',
								value: savePackageCode,
							},
							{
								name: 'params',
								kind: 'code',
								lang: 'json',
								value: jsonInput({
									package_id: 'pkg_kody_bot_shipped',
									files: packageSaveFiles(true),
									confirm_destructive_overwrite: true,
								}),
							},
							conversationIdInput(phoneConversationId),
							memoryContextInput(),
						],
						resultLang: 'md',
						result: executeTextReturn({
							conversationId: phoneConversationId,
							value: {
								package_id: 'pkg_kody_bot_shipped',
								kody_id: 'kody-bot-shipped',
								name: '@you/kody-bot-shipped',
								description: 'What kody-bot shipped since you last asked.',
								tags: [],
								has_app: false,
								hidden: false,
								source_id: 'src_kody_bot_shipped',
								created_at: '2026-08-13T14:52:00.000Z',
								updated_at: '2026-08-13T15:08:00.000Z',
								pending_secret_package_approvals: null,
								next_steps:
									'Coding agents with local filesystem/git access should use the git lane for further edits instead of re-sending full file sets: call package_get_git_remote({ kody_id: "kody-bot-shipped" }), run the returned setup_commands to clone into a temporary directory, edit and push normally, then publish with package_publish_external_push. Binary assets and multi-file refactors are only supported through that git lane. Tool-only agents without local git can continue with package_save or repo sessions.',
							},
						}),
					},
				],
			},
			{
				role: 'agent',
				text: 'It will check every morning. If kody-bot shipped something, you get mail. If not, nothing hits your inbox.',
			},
		],
	},
]
