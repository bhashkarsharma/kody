import { parseSafe } from 'remix/data-schema'
import {
	outboundEmailSchema,
	type OutboundEmail,
} from '@kody-internal/shared/outbound-email.ts'
import { redactEmailRecipient } from '#worker/audit-log.ts'

type CloudflareEmailClientConfig = {
	accountId?: string
	apiBaseUrl?: string
	apiToken?: string
	// AgentMail transport (fork trim): when `agentmailApiKey` is configured,
	// outbound mail is sent through the AgentMail REST API
	// (`POST /v0/inboxes/{inbox}/messages/send`) from `agentmailFrom` instead
	// of Cloudflare Email Sending. This lets a fork route Kody's transactional
	// email (verification, password reset, alerts) through an agentmail.to
	// inbox without onboarding a Cloudflare Email Sending domain.
	agentmailApiKey?: string
	agentmailFrom?: string
}

const defaultCloudflareApiBaseUrl = 'https://api.cloudflare.com'

type CloudflareApiEnvelope = {
	success: boolean
	errors?: Array<{
		code?: number | string
		message?: string
	}>
	result?: {
		message_id?: string
		delivered?: string[]
		permanent_bounces?: string[]
		queued?: string[]
	}
}

type CloudflareSendResult = {
	ok: boolean
	skipped?: boolean
	error?: string
	messageId?: string | null
}

function normalizeEmailPayload(message: OutboundEmail) {
	const result = parseSafe(outboundEmailSchema, message)
	if (!result.success) {
		const issueMessage = result.issues
			.map((issue) => {
				const path =
					Array.isArray(issue.path) && issue.path.length > 0
						? issue.path.join('.')
						: 'payload'
				return `${path}: ${issue.message}`
			})
			.join(', ')
		throw new Error(`Invalid outbound email payload: ${issueMessage}`)
	}
	return result.value
}

function redactRecipients(to: string | Array<string>) {
	if (Array.isArray(to)) return to.map(redactEmailRecipient)
	return redactEmailRecipient(to)
}

function logSkippedEmail(reason: string, message: OutboundEmail) {
	// Informational: callers decide whether a skipped send is a problem (the
	// verification flow throws in production), so an unconfigured client in
	// local dev / e2e runs must not surface as a warning.
	console.info(
		reason,
		JSON.stringify({
			to: redactRecipients(message.to),
			from: message.from,
			subject: message.subject,
		}),
	)
}

function normalizeApiBaseUrl(apiBaseUrl: string) {
	return apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`
}

async function sendViaCloudflareApi(
	config: Required<
		Pick<CloudflareEmailClientConfig, 'accountId' | 'apiBaseUrl' | 'apiToken'>
	>,
	message: OutboundEmail,
): Promise<CloudflareSendResult> {
	const endpoint = new URL(
		`client/v4/accounts/${config.accountId}/email/sending/send`,
		normalizeApiBaseUrl(config.apiBaseUrl),
	)
	let response: Response
	try {
		response = await fetch(endpoint.toString(), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(message),
		})
	} catch (error) {
		console.warn('cloudflare-email-api-request-failed', error)
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: 'Cloudflare Email API request failed.',
		}
	}

	const payload = (await response.json()) as CloudflareApiEnvelope
	if (!response.ok || payload?.success !== true) {
		console.warn(
			'cloudflare-email-api-failed',
			JSON.stringify({
				status: response.status,
				body: payload,
				to: message.to,
				from: message.from,
				subject: message.subject,
			}),
		)
		return {
			ok: false,
			error:
				payload?.errors?.[0]?.message ??
				'Cloudflare Email API returned an error response.',
		}
	}

	return {
		ok: true,
		messageId: payload.result?.message_id ?? null,
	}
}

async function sendViaAgentMail(
	config: { apiKey: string; inboxId: string },
	message: OutboundEmail,
): Promise<CloudflareSendResult> {
	if (!config.inboxId) {
		return { ok: false, error: 'AGENTMAIL_FROM is not configured.' }
	}
	const endpoint = new URL(
		`v0/inboxes/${encodeURIComponent(config.inboxId)}/messages/send`,
		'https://api.agentmail.to/',
	)
	let response: Response
	try {
		response = await fetch(endpoint.toString(), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				to: message.to,
				subject: message.subject,
				text: message.text,
				html: message.html,
			}),
		})
	} catch (error) {
		console.warn('agentmail-send-request-failed', error)
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: 'AgentMail request failed.',
		}
	}

	const payload = (await response.json()) as {
		error?: { message?: string }
		message_id?: string
		id?: string
	}
	if (!response.ok) {
		console.warn(
			'agentmail-send-failed',
			JSON.stringify({
				status: response.status,
				body: payload,
				to: message.to,
				from: message.from,
				subject: message.subject,
			}),
		)
		return {
			ok: false,
			error:
				payload.error?.message ??
				`AgentMail returned HTTP ${response.status}.`,
		}
	}

	return {
		ok: true,
		messageId: payload.message_id ?? payload.id ?? null,
	}
}

export async function sendCloudflareEmail(
	config: CloudflareEmailClientConfig,
	message: Omit<OutboundEmail, 'replyTo' | 'headers' | 'attachments'> &
		Partial<Pick<OutboundEmail, 'replyTo' | 'headers' | 'attachments'>>,
): Promise<CloudflareSendResult> {
	const normalized = normalizeEmailPayload({
		...message,
		replyTo: message.replyTo,
		headers: message.headers,
		attachments: message.attachments,
	})
	const apiBaseUrl =
		typeof config.apiBaseUrl === 'string' && config.apiBaseUrl.trim().length > 0
			? config.apiBaseUrl.trim()
			: defaultCloudflareApiBaseUrl
	// Fork trim: AgentMail takes precedence when its API key is configured.
	const agentmailApiKey =
		typeof config.agentmailApiKey === 'string' &&
		config.agentmailApiKey.trim().length > 0
			? config.agentmailApiKey.trim()
			: ''
	if (agentmailApiKey) {
		return sendViaAgentMail(
			{
				apiKey: agentmailApiKey,
				inboxId:
					typeof config.agentmailFrom === 'string'
						? config.agentmailFrom.trim()
						: '',
			},
			normalized,
		)
	}
	const hasApiConfig =
		typeof config.apiToken === 'string' &&
		config.apiToken.trim().length > 0 &&
		typeof config.accountId === 'string' &&
		config.accountId.trim().length > 0

	if (hasApiConfig) {
		return sendViaCloudflareApi(
			{
				accountId: config.accountId!.trim(),
				apiBaseUrl,
				apiToken: config.apiToken!.trim(),
			},
			normalized,
		)
	}

	logSkippedEmail('cloudflare-email-unconfigured', normalized)
	return { ok: false, skipped: true }
}
