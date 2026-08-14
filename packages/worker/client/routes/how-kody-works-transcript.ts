export type TranscriptHint = {
	label: string
	kind: 'memory' | 'query' | 'code' | 'schedule' | 'result'
	detail: string
}

export type TranscriptTool = {
	name: string
	summary: string
	hints: Array<TranscriptHint>
	lang?: string
	code: string
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

export const howKodyWorksTranscriptActs: Array<TranscriptAct> = [
	{
		id: 'ask',
		kicker: 'In Cursor',
		title: 'Ask once',
		lines: [
			{
				role: 'user',
				text: 'What did kody-bot ship recently?',
			},
			{
				role: 'agent',
				text: 'I will check kody-bot’s public GitHub activity and remember that login so we do not have to rediscover it.',
			},
			{
				role: 'tools',
				tools: [
					{
						name: 'search',
						summary: 'Find how to read one GitHub user’s public activity',
						hints: [
							{
								label: 'query',
								kind: 'query',
								detail: 'github public events for a user',
							},
							{
								label: 'domain',
								kind: 'query',
								detail: 'integrations',
							},
						],
						lang: 'json',
						code: `{
  "query": "github public events user activity",
  "domain": "integrations"
}`,
					},
					{
						name: 'execute',
						summary: 'Fetch public events and keep only real ships',
						hints: [
							{
								label: 'username',
								kind: 'memory',
								detail: 'kody-bot — the GitHub login this question is about',
							},
							{
								label: 'filter',
								kind: 'code',
								detail: 'published releases and new public repositories only',
							},
						],
						lang: 'ts',
						code: `export default async function main() {
	const response = await fetch(
		'https://api.github.com/users/kody-bot/events/public',
		{
			headers: {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'kody',
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
}`,
					},
					{
						name: 'meta_memory_verify',
						summary: 'Check before writing a durable fact',
						hints: [
							{
								label: 'memory',
								kind: 'memory',
								detail: 'Who “kody-bot” is, so the next ask skips rediscovery',
							},
						],
						lang: 'json',
						code: `{
  "subject": "GitHub login to watch for shipping",
  "summary": "kody-bot is the GitHub user whose public releases and new repos I care about."
}`,
					},
					{
						name: 'meta_memory_upsert',
						summary: 'Keep the login after verify says it is new',
						hints: [
							{
								label: 'memory',
								kind: 'memory',
								detail: 'verified_by_agent must be true after review',
							},
						],
						lang: 'json',
						code: `{
  "category": "identifier",
  "subject": "GitHub login to watch for shipping",
  "summary": "kody-bot is the GitHub user whose public releases and new repos I care about.",
  "verified_by_agent": true
}`,
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
				text: 'I will save the filter as an export you own, with a daily wrapper left off until we test it.',
			},
			{
				role: 'tools',
				tools: [
					{
						name: 'coding_guide_get',
						summary: 'Load the package authoring and lifecycle guides',
						hints: [
							{
								label: 'guide',
								kind: 'query',
								detail: 'package_authoring, then package_lifecycle',
							},
						],
						lang: 'json',
						code: `{ "guide": "package_authoring" }`,
					},
					{
						name: 'package_save',
						summary: 'Write the owned package: export, cursor, quiet job',
						hints: [
							{
								label: 'kody_id',
								kind: 'code',
								detail: 'kody-bot-shipped',
							},
							{
								label: 'cursor',
								kind: 'memory',
								detail:
									'newest event id in packageStorage(), shared by ask and cron',
							},
							{
								label: 'job',
								kind: 'schedule',
								detail: 'daily wrapper, enabled: false until invoked once',
							},
						],
						lang: 'json',
						code: `{
  "kody_id": "kody-bot-shipped",
  "files": {
    "package.json": "{ exports, kody.id, kody.jobs.daily-digest enabled:false }",
    "README.md": "## Intent — email only when kody-bot actually shipped",
    "src/what-shipped.ts": "list + advance cursor",
    "src/daily-digest.ts": "same list; email_send only if shipped.length > 0"
  }
}`,
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
				text: 'What did kody-bot ship recently?',
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
						hints: [
							{
								label: 'query',
								kind: 'query',
								detail: 'kody-bot shipped',
							},
							{
								label: 'memory',
								kind: 'memory',
								detail: 'the saved login points search at the right package',
							},
						],
						lang: 'json',
						code: `{ "query": "kody-bot shipped" }`,
					},
					{
						name: 'execute',
						summary: 'Invoke the export — no model rewriting the filter',
						hints: [
							{
								label: 'kodyId',
								kind: 'code',
								detail: 'kody-bot-shipped',
							},
							{
								label: 'export',
								kind: 'code',
								detail: './whatShipped',
							},
						],
						lang: 'ts',
						code: `import { packages } from 'kody:runtime'

export default async function main() {
	return await packages.invoke({
		kodyId: 'kody-bot-shipped',
		exportName: './whatShipped',
	})
}`,
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
						hints: [
							{
								label: 'export',
								kind: 'schedule',
								detail: './daily-digest — same contract as the cron',
							},
							{
								label: 'quiet day',
								kind: 'result',
								detail: '{ emailed: false } — no mail',
							},
						],
						lang: 'ts',
						code: `import { packages } from 'kody:runtime'

export default async function main() {
	return await packages.invoke({
		kodyId: 'kody-bot-shipped',
		exportName: './daily-digest',
	})
}`,
					},
					{
						name: 'package_save',
						summary: 'Enable the daily job after the wrapper succeeds',
						hints: [
							{
								label: 'schedule',
								kind: 'schedule',
								detail: '0 8 * * * in America/Denver',
							},
							{
								label: 'email',
								kind: 'result',
								detail: 'email_send only when shipped.length > 0',
							},
						],
						lang: 'json',
						code: `{
  "kody": {
    "jobs": {
      "daily-digest": {
        "entry": "./src/daily-digest.ts",
        "schedule": { "type": "cron", "expression": "0 8 * * *" },
        "timezone": "America/Denver",
        "enabled": true
      }
    }
  }
}`,
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
				'User-Agent': 'kody',
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
