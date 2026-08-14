import { css } from 'remix/ui'
import { CopyCodeBlock } from '#client/copy-code-block.tsx'
import {
	howKodyWorksPackageFiles,
	howKodyWorksTranscriptActs,
	type TranscriptHint,
	type TranscriptLine,
	type TranscriptTool,
} from './how-kody-works-transcript.ts'
import {
	colors,
	radius,
	spacing,
	typography,
} from '#universal/styles/tokens.ts'

/**
 * Interactive factory-loop transcript for /guides/how-kody-works.
 * Tool calls are native <details> so they work without JavaScript.
 * This is a render helper, not a Remix component — only CopyCodeBlock
 * needs a handle.
 */
export function renderHowKodyWorksWalkthrough() {
	return (
		<div mix={css(walkthroughCss)}>
			<p mix={css(leadCss)}>
				A question you would ask again becomes an export you can invoke from any
				agent, then a daily email that stays quiet until something actually
				shipped.
			</p>

			{howKodyWorksTranscriptActs.map((act) => (
				<section
					key={act.id}
					mix={css(actCss)}
					aria-labelledby={`${act.id}-title`}
				>
					<p mix={css(kickerCss)}>{act.kicker}</p>
					<h2 id={`${act.id}-title`}>{act.title}</h2>
					<ol mix={css(threadCss)}>
						{act.lines.map((line, index) => (
							<li key={`${act.id}-${index}`}>{renderLine(line)}</li>
						))}
					</ol>
				</section>
			))}

			<section mix={css(actCss)} aria-labelledby="package-files-title">
				<p mix={css(kickerCss)}>The package</p>
				<h2 id="package-files-title">What the agent wrote</h2>
				<p mix={css(packageLeadCss)}>
					Same implementation for “ask again” and the morning job. The job calls{' '}
					<code>email_send</code> only when the list is not empty.
				</p>
				{(
					Object.entries(howKodyWorksPackageFiles) as Array<
						[keyof typeof howKodyWorksPackageFiles, string]
					>
				).map(([path, code]) => (
					<details key={path} mix={css(toolCss)}>
						<summary>
							<span mix={css(toolNameCss)}>{path}</span>
							<span mix={css(toolSummaryCss)}>{packageFileSummary(path)}</span>
						</summary>
						<div mix={css(toolBodyCss)}>
							<CopyCodeBlock
								code={code}
								lang={
									path.endsWith('.ts')
										? 'ts'
										: path.endsWith('.json')
											? 'json'
											: 'md'
								}
							/>
						</div>
					</details>
				))}
			</section>
		</div>
	)
}

function packageFileSummary(path: keyof typeof howKodyWorksPackageFiles) {
	switch (path) {
		case 'src/daily-digest.ts':
			return 'Skip mail on a quiet day'
		case 'src/what-shipped.ts':
			return 'Filter public events and advance the cursor'
		case 'package.json':
			return 'Export plus a disabled daily job'
		case 'README.md':
			return 'Why this package exists'
		default: {
			const exhaustive: never = path
			return exhaustive
		}
	}
}

function renderLine(line: TranscriptLine) {
	if (line.role === 'user') {
		return (
			<figure mix={css(youCss)}>
				<figcaption>You</figcaption>
				<blockquote>
					<p>{line.text}</p>
				</blockquote>
			</figure>
		)
	}
	if (line.role === 'agent') {
		return (
			<figure mix={css(agentCss)}>
				<figcaption>Agent</figcaption>
				<blockquote>
					<p>{line.text}</p>
				</blockquote>
			</figure>
		)
	}
	return (
		<div mix={css(toolsCss)}>
			{line.tools.map((tool) => renderToolCall(tool))}
		</div>
	)
}

function renderToolCall(tool: TranscriptTool) {
	return (
		<details key={`${tool.name}-${tool.summary}`} mix={css(toolCss)}>
			<summary>
				<span mix={css(toolNameCss)}>{tool.name}</span>
				<span mix={css(toolSummaryCss)}>{tool.summary}</span>
			</summary>
			<div mix={css(toolBodyCss)}>
				<ul mix={css(hintsCss)}>
					{tool.hints.map((hint) => (
						<li key={hint.label}>{renderHint(hint)}</li>
					))}
				</ul>
				<CopyCodeBlock code={tool.code} lang={tool.lang ?? 'ts'} />
			</div>
		</details>
	)
}

function renderHint(hint: TranscriptHint) {
	return (
		<div mix={css(hintCss)} data-kind={hint.kind}>
			<span mix={css(hintLabelCss)}>{hint.label}</span>
			<span>{hint.detail}</span>
		</div>
	)
}

const walkthroughCss = {
	marginTop: 'clamp(1.8rem, 4vw, 2.5rem)',
}

const leadCss = {
	margin: '0 0 clamp(2rem, 5vw, 2.8rem)',
	color: colors.textMuted,
	fontSize: '1.05rem',
	textWrap: 'pretty' as const,
}

const actCss = {
	marginTop: 'clamp(2.4rem, 6vw, 3.4rem)',
	'& h2': {
		margin: '0.2rem 0 0',
		fontSize: '1.55rem',
		fontWeight: 720,
		letterSpacing: '-0.02em',
	},
}

const kickerCss = {
	margin: 0,
	fontSize: '0.78rem',
	fontWeight: 600,
	letterSpacing: '0.12em',
	textTransform: 'uppercase' as const,
	color: colors.primaryText,
}

const threadCss = {
	listStyle: 'none',
	margin: '1.25rem 0 0',
	padding: 0,
	display: 'grid',
	gap: '0.9rem',
}

const bubbleCss = {
	margin: 0,
	'& figcaption': {
		margin: 0,
		fontSize: '0.75rem',
		fontWeight: 650,
		letterSpacing: '0.06em',
		textTransform: 'uppercase' as const,
		color: colors.textMuted,
	},
	'& blockquote': {
		margin: '0.35rem 0 0',
		padding: `${spacing.sm} ${spacing.md}`,
		borderRadius: radius.lg,
		border: `1px solid ${colors.border}`,
	},
	'& p': {
		margin: 0,
		textWrap: 'pretty' as const,
	},
}

const youCss = {
	...bubbleCss,
	'& blockquote': {
		...bubbleCss['& blockquote'],
		backgroundColor: colors.primarySoftest,
		borderColor: colors.primarySoft,
	},
}

const agentCss = {
	...bubbleCss,
	'& blockquote': {
		...bubbleCss['& blockquote'],
		backgroundColor: colors.surface,
	},
}

const toolsCss = {
	display: 'grid',
	gap: '0.55rem',
}

const toolCss = {
	border: `1px solid ${colors.border}`,
	borderRadius: radius.lg,
	backgroundColor: colors.surface,
	'& summary': {
		display: 'grid',
		gridTemplateColumns: 'auto 1fr',
		columnGap: spacing.sm,
		rowGap: '0.15rem',
		alignItems: 'baseline',
		padding: `${spacing.sm} ${spacing.md}`,
		cursor: 'pointer',
		listStyle: 'none',
		'&::-webkit-details-marker': { display: 'none' },
	},
	'&[open] summary': {
		borderBottom: `1px solid ${colors.border}`,
	},
}

const toolNameCss = {
	fontFamily: typography.fontFamily,
	fontSize: '0.82rem',
	fontWeight: 700,
	color: colors.primaryText,
}

const toolSummaryCss = {
	fontSize: '0.92rem',
	color: colors.textMuted,
}

const toolBodyCss = {
	padding: spacing.md,
	display: 'grid',
	gap: spacing.sm,
}

const hintsCss = {
	listStyle: 'none',
	margin: 0,
	padding: 0,
	display: 'grid',
	gap: '0.45rem',
}

const hintCss = {
	display: 'grid',
	gridTemplateColumns: 'auto 1fr',
	gap: `${spacing.xs} ${spacing.sm}`,
	alignItems: 'baseline',
	fontSize: '0.88rem',
	color: colors.text,
	'&[data-kind="memory"] span:first-child': {
		backgroundColor: colors.primarySoft,
		color: colors.primaryText,
	},
}

const hintLabelCss = {
	padding: '0.1rem 0.45rem',
	borderRadius: radius.full,
	backgroundColor: colors.primarySoftest,
	color: colors.textMuted,
	fontSize: '0.72rem',
	fontWeight: 700,
	letterSpacing: '0.04em',
	textTransform: 'uppercase' as const,
}

const packageLeadCss = {
	margin: '0.7rem 0 1rem',
	color: colors.textMuted,
	textWrap: 'pretty' as const,
	'& code': {
		fontSize: '0.9em',
	},
}
