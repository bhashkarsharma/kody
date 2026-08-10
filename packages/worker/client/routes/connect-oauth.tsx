import {
	normalizeProviderKey,
	safeParseHost,
} from '@kody-internal/shared/url-hosts.ts'
import {
	type AccountIntegrationDetailLoaderData,
	type ConnectOauthExistingConnection,
	type ConnectOauthLoaderData,
} from '#universal/loader-data.ts'
import { type Handle, css } from 'remix/ui'
import { CopyTextButton } from '#client/copy-text-button.tsx'
import { on } from '#client/event-mixin.ts'
import { ProviderIcon } from '#client/provider-icons.tsx'
import { readCurrentRouterHref } from '#client/client-router.tsx'
import { tryConsumeRouteLoaderData } from '#client/loader-data-context.tsx'
import {
	readJson,
	buildHostApprovalRequestUrl,
	submitApprovalRequest,
} from '#client/routes/account-approval-shared.ts'
import {
	type RouteLoaderResult,
	routeLoaderRedirect,
} from '#client/route-loader.ts'
import { passwordManagerIgnoreProps } from '#client/password-manager-ignore.ts'
import {
	colors,
	radius,
	spacing,
	transitions,
	typography,
} from '#universal/styles/tokens.ts'
import {
	cardCss,
	cardTitleCss,
	descriptionCss,
	detailGridCss,
	detailItemCss,
	detailLabelCss,
	detailValueCss,
	fieldCss,
	fieldLabelCss,
	getBrandChipCss,
	getPrimaryButtonCss,
	getSecondaryButtonCss,
	hoverMq,
	insetCardCss,
	listCss,
	primaryLinkCss,
	sectionTitleCss,
	stackedPageCss,
	inputCss,
} from '#universal/styles/style-primitives.ts'
import {
	type ConnectOauthConfig,
	type ConnectOauthHostApprovalLink,
	type ConnectOauthNextSteps,
	type ConnectOauthQueryConfig,
	type OAuthFlow,
	type StoredIntegrationConfig,
	createCodeChallenge,
	createCodeVerifier,
	formatConnectOauthCaughtError,
	formatMissingSetupFields,
	formatOAuthExchangeFailure,
	isSafeExternalUrl,
	mergeConnectOauthConfig,
	normalizeHosts,
	parseAllowedHosts,
	parseConnectOauthNextSteps,
	parseExtraParams,
	parseHostApprovalLinks,
	parseOptionalBoolean,
	parseOptionalUrl,
	parseProviderSetupInstructions,
	parseScopes,
	parseSessionConnectOauthConfig,
	parseTokenExchangeStyle,
	summarizeStoredSetupState,
	toStoredIntegrationConfig,
} from './connect-oauth-config.ts'

type OAuthExchangeResult =
	| { ok: true; data: Record<string, unknown>; status: number }
	| { ok: false; status: number; error: string }

type SaveSecretResult = { ok: true } | { ok: false; error: string }

type SaveOauthAppResult =
	| { ok: true; clientId: string }
	| { ok: false; error: string }

type OAuthCallback =
	| { kind: 'none' }
	| { kind: 'error'; error: string; description: string | null }
	| { kind: 'success'; code: string; state: string | null }

const emptyConnectOauthLoaderData: ConnectOauthLoaderData = {
	ok: true,
	provider: null,
	integration: null,
}

/**
 * SPA-navigation prefetch mirroring the server handler's SSR embed: the
 * stored or built-in record for `?provider=` visits, resolved before the
 * route renders. Callback returns (`code`/`error`) restore config from
 * sessionStorage and bare visits redirect server-side, so both prefetch
 * nothing.
 */
export async function connectOauthRouteLoader(
	url: URL,
	signal: AbortSignal,
): Promise<RouteLoaderResult> {
	const params = url.searchParams
	const provider = params.get('provider')?.trim()
	if (!provider || params.get('code') || params.get('error')) {
		return { connectOauth: emptyConnectOauthLoaderData }
	}
	const providerKey = normalizeProviderKey(provider)
	if (!providerKey) {
		return { connectOauth: emptyConnectOauthLoaderData }
	}
	const platformParam = params.get('platform')?.trim()
	const response = await fetch(
		`/account/integrations.json?name=${encodeURIComponent(providerKey)}${platformParam ? `&platform=${encodeURIComponent(platformParam)}` : ''}`,
		{
			headers: { Accept: 'application/json' },
			credentials: 'include',
			signal,
		},
	)
	if (response.status === 401) {
		return routeLoaderRedirect('/login')
	}
	const payload = await readJson<AccountIntegrationDetailLoaderData>(response)
	return {
		connectOauth: {
			ok: true,
			provider: providerKey,
			integration:
				response.ok && payload?.ok ? (payload.integration ?? null) : null,
			builtInAvailable:
				response.ok && payload?.ok
					? (payload.builtInAvailable ?? false)
					: false,
			existingConnection:
				response.ok && payload?.ok
					? (payload.existingConnection ?? null)
					: null,
			hasStoredClientSecret:
				response.ok && payload?.ok
					? (payload.hasStoredClientSecret ?? false)
					: false,
		},
	}
}

export function ConnectOauthRoute(handle: Handle) {
	type StatusTone = 'info' | 'warn' | 'error'

	// Mirrors the server-side bare-visit redirect for SPA-internal
	// navigations: no provider, no callback code, and no provider error
	// means there is no flow to set up or resume here.
	if (typeof window !== 'undefined') {
		const params = new URLSearchParams(window.location.search)
		if (
			!params.get('provider') &&
			!params.get('code') &&
			!params.get('error')
		) {
			window.location.replace('/guides/oauth')
		}
	}

	// The real status arrives once the query config and any stored/built-in
	// provider config resolve; starting on "Ready to connect." flashed a
	// misleading state on slow connections. Provider visits resolve during
	// render from SSR-embedded / SPA-preloaded loader data, so this fallback
	// only shows on callback returns and loader-failure refetches.
	let statusMessage = 'Loading provider configuration…'
	let statusTone: StatusTone = 'info'
	let currentStep: 'setup' | 'connect' | 'callback' | 'success' = 'setup'
	let config: ConnectOauthConfig | null = null
	let existingIntegrationConfig: StoredIntegrationConfig | null = null
	let accessTokenSaved = false
	let refreshTokenSaved = false
	let hasConfigError = false
	let connectOauthHandled = false
	let hostApprovalLinks: Array<ConnectOauthHostApprovalLink> = []
	/** An enabled built-in exists that this user-lane connection is not using. */
	let builtInAvailable = false
	/** The connection currently stored under the target name, when any. */
	let existingConnection: ConnectOauthExistingConnection | null = null
	/** The user explicitly confirmed replacing a different-app connection. */
	let replaceConfirmed = false
	let renameInput = ''

	/**
	 * True when finishing this flow would overwrite a connection that runs on
	 * a different app or lane — never silently: the user confirms (or renames)
	 * first. Reconnecting the same app under the same name stays free.
	 */
	const wouldReplaceDifferentApp = () => {
		if (!config || !existingConnection) return false
		if (config.platformAppSlug) {
			return (
				existingConnection.lane !== 'platform' ||
				existingConnection.appSlug !== config.platformAppSlug
			)
		}
		return existingConnection.lane === 'platform'
	}
	let nextSteps: ConnectOauthNextSteps | null = null
	let approvingAllHosts = false
	let submitting = false
	let initialLoadStarted = false
	let routeDataApplied = false
	/**
	 * Normalized pathname+search the current resolution state belongs to.
	 * SPA navigations to a different connect URL (another provider, a
	 * platform lane switch) reset and re-resolve instead of keeping the
	 * previous provider's config on screen.
	 */
	let resolvedHref: string | null = null
	/** Server-computed redirect URI so SSR renders the card `window` builds. */
	let ssrRedirectUri: string | null = null
	let clientIdInput = ''
	let clientSecretInput = ''
	let hasStoredClientId = false
	let hasStoredClientSecret = false
	let revealStoredClientSecretField = false

	const normalizeConnectHref = (href: string) => {
		const url = new URL(href, 'https://kody.local')
		return `${url.pathname}${url.search}`
	}

	// Back to the pre-resolution defaults so a new connect URL resolves from
	// scratch (loader data first, fallback fetch otherwise).
	const resetResolutionState = () => {
		routeDataApplied = false
		initialLoadStarted = false
		resolvedHref = null
		config = null
		existingIntegrationConfig = null
		existingConnection = null
		builtInAvailable = false
		hasStoredClientSecret = false
		hasConfigError = false
		replaceConfirmed = false
		renameInput = ''
		hostApprovalLinks = []
		nextSteps = null
		accessTokenSaved = false
		refreshTokenSaved = false
		currentStep = 'setup'
		statusMessage = 'Loading provider configuration…'
		statusTone = 'info'
	}

	const update = () => handle.update()

	const setStatus = (message: string, tone: StatusTone = 'info') => {
		statusMessage = message
		statusTone = tone
		update()
	}

	const setStep = (step: typeof currentStep) => {
		currentStep = step
		update()
	}

	const setHostApprovalLinks = (
		links: Array<ConnectOauthHostApprovalLink>,
	): void => {
		hostApprovalLinks = links
		update()
	}

	const setNextSteps = (value: ConnectOauthNextSteps | null): void => {
		nextSteps = value
		update()
	}

	const approveAllHostApprovals = async () => {
		if (approvingAllHosts || hostApprovalLinks.length === 0) return
		approvingAllHosts = true
		update()
		const remainingLinks = [...hostApprovalLinks]
		try {
			for (const link of remainingLinks) {
				const requestUrl = buildHostApprovalRequestUrl(
					link.approvalUrl,
					window.location.origin,
				)
				await submitApprovalRequest('approve', requestUrl)
				hostApprovalLinks = hostApprovalLinks.filter(
					(entry) =>
						entry.secretName !== link.secretName || entry.host !== link.host,
				)
				update()
			}
			setStatus('All hosts approved.', 'info')
		} catch (error) {
			setStatus(
				formatConnectOauthCaughtError(error, 'Unable to approve all hosts.'),
				'error',
			)
		} finally {
			approvingAllHosts = false
			update()
		}
	}

	type QueryConfigResult =
		| { ok: true; value: ConnectOauthQueryConfig }
		| { ok: false; error: string }

	// Pure so it can run during render (SSR included) without touching
	// component state; callers apply the error to status themselves.
	const readQueryConfig = (url: URL): QueryConfigResult => {
		const readRequired = (key: string) => {
			const value = url.searchParams.get(key)
			return value && value.trim() ? value.trim() : null
		}
		const readOptional = (key: string) => {
			const value = url.searchParams.get(key)
			return value && value.trim() ? value.trim() : null
		}
		const provider = readRequired('provider')
		const authorizeUrl = readOptional('authorizeUrl')
		const tokenUrl = readOptional('tokenUrl')
		const apiBaseUrl = parseOptionalUrl(readOptional('apiBaseUrl'))
		if (!provider) {
			return {
				ok: false,
				error: 'Missing required OAuth configuration parameters.',
			}
		}
		const authorizeHost = authorizeUrl ? safeParseHost(authorizeUrl) : null
		if (authorizeUrl && (!isSafeExternalUrl(authorizeUrl) || !authorizeHost)) {
			return { ok: false, error: 'Authorize URL must be valid.' }
		}
		const tokenHost = tokenUrl ? safeParseHost(tokenUrl) : null
		if (tokenUrl && !tokenHost) {
			return { ok: false, error: 'Token URL must be valid when provided.' }
		}
		const rawFlow = readOptional('flow')?.toLowerCase() ?? null
		const flow: OAuthFlow | null =
			rawFlow === 'pkce' || rawFlow === 'confidential' ? rawFlow : null
		const usePkce = parseOptionalBoolean(readOptional('pkce'))
		const tokenExchangeStyle = parseTokenExchangeStyle(
			readOptional('tokenExchangeStyle'),
		)
		const rawScopes = readOptional('scopes')
		const scopes = rawScopes == null ? null : parseScopes(rawScopes)
		const scopeSeparator = readOptional('scopeSeparator')
		const rawExtraAuthorizeParams = readOptional('extraAuthorizeParams')
		const extraAuthorizeParams =
			rawExtraAuthorizeParams == null
				? null
				: parseExtraParams(rawExtraAuthorizeParams)
		const dashboardUrl = parseOptionalUrl(readOptional('dashboardUrl'))
		const providerKey = normalizeProviderKey(provider)
		if (!providerKey) {
			return { ok: false, error: 'Provider must contain letters or numbers.' }
		}
		const providerSetupInstructions = parseProviderSetupInstructions(
			readOptional('providerSetupInstructions'),
		)
		const allowedHosts = normalizeHosts([
			...(tokenHost ? [tokenHost] : []),
			...parseAllowedHosts(readOptional('allowedHosts')),
		])
		return {
			ok: true,
			value: {
				provider,
				providerKey,
				authorizeHost,
				authorizeUrl,
				tokenUrl,
				apiBaseUrl,
				scopes,
				flow,
				usePkce,
				tokenExchangeStyle,
				scopeSeparator,
				extraAuthorizeParams,
				providerSetupInstructions,
				dashboardUrl,
				allowedHosts,
			},
		}
	}

	const readCallback = (): OAuthCallback => {
		if (typeof window === 'undefined') return { kind: 'none' }
		const params = new URLSearchParams(window.location.search)
		const error = params.get('error')
		const description = params.get('error_description')
		if (error) {
			return { kind: 'error', error, description }
		}
		const code = params.get('code')
		if (!code) return { kind: 'none' }
		return { kind: 'success', code, state: params.get('state') }
	}

	const getRedirectUri = (): string => {
		if (typeof window === 'undefined') return ssrRedirectUri ?? ''
		return `${window.location.origin}${window.location.pathname}`
	}

	const getStateKey = (providerKey: string) => `connect-oauth:${providerKey}`

	const getPkceKey = (providerKey: string) =>
		`connect-oauth:${providerKey}:pkce`

	const configStorageKey = 'connect-oauth:config'

	const persistConfig = (nextConfig: ConnectOauthConfig) => {
		try {
			sessionStorage.setItem(configStorageKey, JSON.stringify(nextConfig))
		} catch {
			// Config caching is best-effort; the required OAuth state write below still fails visibly.
		}
	}

	const readStoredConfig = (): ConnectOauthConfig | null => {
		if (typeof window === 'undefined') return null
		const raw = sessionStorage.getItem(configStorageKey)
		if (!raw) return null
		return parseSessionConnectOauthConfig(raw)
	}

	const createState = (key: string) => {
		const value = crypto.randomUUID()
		sessionStorage.setItem(key, value)
		return value
	}

	const validateState = (key: string, returned: string | null) => {
		const expected = sessionStorage.getItem(key)
		return Boolean(expected && returned && expected === returned)
	}

	const reservedAuthorizeParams = new Set([
		'client_id',
		'code_challenge',
		'code_challenge_method',
		'redirect_uri',
		'response_type',
		'scope',
		'state',
	])

	const buildAuthorizeUrl = async (nextConfig: ConnectOauthConfig) => {
		if (hasConfigError) {
			throw new Error('Unable to start OAuth with invalid configuration.')
		}
		persistConfig(nextConfig)
		const url = new URL(nextConfig.authorizeUrl)
		url.searchParams.set('response_type', 'code')
		const clientId = nextConfig.clientId.trim()
		if (!clientId) {
			throw new Error('Missing client ID. Save it before connecting.')
		}
		url.searchParams.set('client_id', clientId)
		url.searchParams.set('redirect_uri', getRedirectUri())
		if (nextConfig.scopes.length > 0) {
			url.searchParams.set(
				'scope',
				nextConfig.scopes.join(nextConfig.scopeSeparator),
			)
		}
		const state = createState(getStateKey(nextConfig.providerKey))
		url.searchParams.set('state', state)
		if (nextConfig.usePkce) {
			const verifier = createCodeVerifier()
			sessionStorage.setItem(getPkceKey(nextConfig.providerKey), verifier)
			const challenge = await createCodeChallenge(verifier)
			url.searchParams.set('code_challenge_method', 'S256')
			url.searchParams.set('code_challenge', challenge)
		}
		for (const [key, value] of Object.entries(
			nextConfig.extraAuthorizeParams,
		)) {
			if (!key) continue
			if (reservedAuthorizeParams.has(key.toLowerCase())) continue
			url.searchParams.set(key, value)
		}
		return url.toString()
	}

	/**
	 * An expired session must land the user on the login page instead of a
	 * generic "Unable to save ..." error mid-flow.
	 */
	const redirectToLoginOn401 = (response: Response) => {
		if (response.status !== 401) return false
		window.location.assign('/login')
		return true
	}

	/**
	 * Fallback fetch mirroring the loader/SSR payload — only runs when a
	 * navigation committed without loader data (loader failure, or callback
	 * returns that lost their sessionStorage snapshot). Captures the
	 * built-in flag and stored-secret existence the same way the loader
	 * data path does.
	 */
	const readExistingIntegrationConfig = async (
		queryConfig: ConnectOauthQueryConfig,
	): Promise<StoredIntegrationConfig | null> => {
		const platformParam =
			typeof window !== 'undefined'
				? (new URLSearchParams(window.location.search)
						.get('platform')
						?.trim() ?? '')
				: ''
		const response = await fetch(
			`/account/integrations.json?name=${encodeURIComponent(queryConfig.providerKey)}${platformParam ? `&platform=${encodeURIComponent(platformParam)}` : ''}`,
			{
				method: 'GET',
				headers: { Accept: 'application/json' },
				credentials: 'include',
			},
		)
		if (redirectToLoginOn401(response)) return null
		const payload = (await response
			.json()
			.catch(() => null)) as AccountIntegrationDetailLoaderData | null
		if (!response.ok || payload?.ok !== true) return null
		builtInAvailable = payload.builtInAvailable ?? false
		existingConnection = payload.existingConnection ?? null
		hasStoredClientSecret = payload.hasStoredClientSecret === true
		if (!payload.integration) return null
		return toStoredIntegrationConfig(payload.integration)
	}

	// Sync so provider visits can render their real setup / ready state in
	// the same pass that resolved `config` (SSR included). Callers set
	// `hasStoredClientSecret` from server data beforehand.
	const applySetupState = (nextConfig: ConnectOauthConfig) => {
		clientIdInput = nextConfig.clientId
		clientSecretInput = ''
		hasStoredClientId = Boolean(nextConfig.clientId.trim())
		// Existence is only meaningful when this connection actually uses a
		// user-held client secret (confidential, non-platform).
		hasStoredClientSecret =
			Boolean(nextConfig.clientSecretSecretName) && hasStoredClientSecret
		revealStoredClientSecretField = false
		const setupStatus = summarizeStoredSetupState({
			flow: nextConfig.flow,
			clientId: nextConfig.clientId,
			hasStoredClientSecret,
			platform: Boolean(nextConfig.platformAppSlug),
		})
		if (setupStatus.isReady) {
			statusMessage = nextConfig.platformAppSlug
				? 'Built-in integration — no OAuth app setup needed. Ready to connect.'
				: existingIntegrationConfig
					? 'Loaded your existing integration config and client credentials. Ready to connect.'
					: 'Loaded your existing OAuth client configuration. Ready to connect.'
			statusTone = 'info'
			currentStep = 'connect'
			return
		}
		const missingDetails = formatMissingSetupFields(setupStatus.missingFields)
		statusMessage = existingIntegrationConfig
			? `Loaded your existing integration config. ${missingDetails}`
			: missingDetails
		statusTone = 'info'
		currentStep = 'setup'
	}

	const saveSecret = async (
		name: string,
		value: string,
		description: string,
		allowedHosts: Array<string>,
	): Promise<SaveSecretResult> => {
		const response = await fetch('/account/secrets.json', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			credentials: 'include',
			body: JSON.stringify({
				action: 'save',
				name,
				value,
				scope: 'user',
				description,
				allowedHosts,
				allowedCapabilities: [],
			}),
		})
		if (redirectToLoginOn401(response)) {
			return { ok: false, error: 'Session expired.' }
		}
		const payload = await response.json().catch(() => null)
		if (!response.ok || payload?.ok !== true) {
			return { ok: false, error: payload?.error || 'Unable to save secret.' }
		}
		return { ok: true }
	}

	const exchangeOAuthCode = async (
		nextConfig: ConnectOauthConfig,
		code: string,
	): Promise<OAuthExchangeResult> => {
		const params = new URLSearchParams()
		params.set('grant_type', 'authorization_code')
		const clientId = nextConfig.clientId.trim()
		if (!clientId) {
			return { ok: false, status: 0, error: 'Missing client ID.' }
		}
		params.set('client_id', clientId)
		params.set('code', code)
		params.set('redirect_uri', getRedirectUri())
		if (nextConfig.usePkce) {
			const verifier = sessionStorage.getItem(
				getPkceKey(nextConfig.providerKey),
			)
			if (!verifier) {
				return { ok: false, status: 0, error: 'Missing PKCE verifier.' }
			}
			params.set('code_verifier', verifier)
		}
		const response = await fetch('/account/secrets.json', {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			credentials: 'include',
			body: JSON.stringify({
				action: 'oauth_exchange',
				tokenUrl: nextConfig.tokenUrl,
				params: params.toString(),
				flow: nextConfig.flow,
				tokenExchangeStyle: nextConfig.tokenExchangeStyle,
				clientSecretSecretName: nextConfig.clientSecretSecretName,
				allowedHosts: nextConfig.allowedHosts,
				...(nextConfig.platformAppSlug
					? { platformAppSlug: nextConfig.platformAppSlug }
					: {}),
			}),
		})
		const text = await response.text()
		let data: Record<string, unknown> | null = null
		try {
			data = JSON.parse(text)
		} catch {
			data = null
		}
		const failure = formatOAuthExchangeFailure({
			status: response.status,
			data,
		})
		if (failure.treatAsSessionExpired) {
			window.location.assign('/login')
			return { ok: false, status: 401, error: 'Session expired.' }
		}
		if (!response.ok || !data) {
			return {
				ok: false,
				status: response.status,
				error: failure.error,
			}
		}
		return { ok: true, data, status: response.status }
	}

	const saveOauthApp = async (
		nextConfig: ConnectOauthConfig,
	): Promise<SaveOauthAppResult> => {
		const response = await fetch('/account/secrets.json', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			credentials: 'include',
			body: JSON.stringify({
				action: 'save_oauth_app',
				provider: nextConfig.provider,
				authorizeUrl: nextConfig.authorizeUrl,
				tokenUrl: nextConfig.tokenUrl,
				apiBaseUrl: nextConfig.apiBaseUrl,
				flow: nextConfig.flow,
				usePkce: nextConfig.usePkce,
				tokenExchangeStyle: nextConfig.tokenExchangeStyle,
				clientId: nextConfig.clientId,
				clientSecretSecretName: nextConfig.clientSecretSecretName,
				scopeSeparator: nextConfig.scopeSeparator,
				extraAuthorizeParams: nextConfig.extraAuthorizeParams,
			}),
		})
		if (redirectToLoginOn401(response)) {
			return { ok: false, error: 'Session expired.' }
		}
		const payload = await response.json().catch(() => null)
		if (!response.ok || payload?.ok !== true) {
			return {
				ok: false,
				error: payload?.error || 'Unable to save OAuth app configuration.',
			}
		}
		const savedClientId =
			typeof payload.app?.clientId === 'string' ? payload.app.clientId : null
		if (!savedClientId) {
			return { ok: false, error: 'Unable to save OAuth app configuration.' }
		}
		return { ok: true, clientId: savedClientId }
	}

	const handleSetupSubmit = async (event: Event) => {
		event.preventDefault()
		if (!config || submitting) return
		submitting = true
		update()
		try {
			const clientId = clientIdInput.trim()
			const clientSecret = clientSecretInput.trim()
			if (!clientId) {
				setStatus('Client ID is required.', 'error')
				return
			}
			if (
				config.flow === 'confidential' &&
				(!hasStoredClientSecret || revealStoredClientSecretField)
			) {
				if (!clientSecret) {
					setStatus('Client secret is required for confidential flow.', 'error')
					return
				}
				const secretResult = await saveSecret(
					config.clientSecretSecretName ?? '',
					clientSecret,
					`${config.provider} OAuth client secret`,
					config.allowedHosts,
				)
				if (!secretResult.ok) {
					setStatus(secretResult.error, 'error')
					return
				}
				hasStoredClientSecret = true
				revealStoredClientSecretField = false
				clientSecretInput = ''
			}
			const nextConfig = { ...config, clientId }
			const appResult = await saveOauthApp(nextConfig)
			if (!appResult.ok) {
				setStatus(appResult.error, 'error')
				return
			}
			config = { ...nextConfig, clientId: appResult.clientId }
			persistConfig(config)
			hasStoredClientId = true
			setStatus('Saved OAuth client configuration.', 'info')
			setStep('connect')
		} catch (error) {
			// fetch() TypeError (Firefox NetworkError / Chromium Failed to fetch)
			// must not escape as unhandledrejection — KODY-CLOUDFLARE-3P.
			setStatus(
				formatConnectOauthCaughtError(
					error,
					'Network error. Please try again.',
				),
				'error',
			)
		} finally {
			submitting = false
			update()
		}
	}

	/**
	 * Interposed before a flow that would overwrite a connection running on
	 * a different app or lane: the user explicitly replaces, or connects the
	 * built-in under a new name so the existing connection stays intact.
	 */
	const renderReplaceConfirmation = () => {
		if (!config || !wouldReplaceDifferentApp() || replaceConfirmed) {
			return null
		}
		const existingLabel =
			existingConnection?.lane === 'platform'
				? `the built-in ${existingConnection.appSlug} integration`
				: 'your own OAuth app'
		const renameSuggestion = `${config.providerKey}-2`
		return (
			<div
				mix={css(replaceCalloutCss)}
				data-testid="connect-replace-confirm-panel"
			>
				<p mix={css({ margin: 0, color: colors.text, fontWeight: 600 })}>
					You already have a {config.providerKey} connection using{' '}
					{existingLabel}.
				</p>
				<p mix={css(descriptionCss)}>
					Continuing replaces its tokens and scopes. You can also keep it and
					connect under a different name.
				</p>
				<div
					mix={css({
						display: 'flex',
						flexWrap: 'wrap',
						gap: spacing.sm,
						alignItems: 'center',
					})}
				>
					<button
						type="button"
						disabled={submitting}
						mix={[
							on('click', () => {
								replaceConfirmed = true
								update()
								void handleConnect()
							}),
							css(getSecondaryButtonCss()),
						]}
						data-testid="connect-replace-confirm"
					>
						Replace {config.providerKey}
					</button>
					{config.platformAppSlug ? (
						<>
							<span mix={css(descriptionCss)}>or connect as</span>
							<input
								type="text"
								placeholder={renameSuggestion}
								value={renameInput}
								{...passwordManagerIgnoreProps}
								mix={[
									on('input', (event) => {
										renameInput = event.currentTarget.value
										update()
									}),
									css({ ...inputCss, maxWidth: '12rem' }),
								]}
								data-testid="connect-rename-input"
							/>
							<button
								type="button"
								disabled={submitting}
								mix={[
									on('click', () => {
										const name = renameInput.trim() || renameSuggestion
										window.location.assign(
											`/connect/oauth?provider=${encodeURIComponent(name)}&platform=${encodeURIComponent(config!.platformAppSlug!)}`,
										)
									}),
									css(getPrimaryButtonCss()),
								]}
								data-testid="connect-rename-submit"
							>
								Connect
							</button>
						</>
					) : null}
				</div>
			</div>
		)
	}

	/**
	 * Shown when the current (or prospective) connection runs on the user's
	 * own OAuth app while an enabled built-in exists for the same name.
	 */
	const renderBuiltInAlternative = () => {
		if (!builtInAvailable || !config || config.platformAppSlug) return null
		return (
			<p mix={css(builtInAlternativeCss)}>
				This uses your own OAuth app for {config.provider}. Prefer the hosted
				one?{' '}
				<a
					href={`/connect/oauth?provider=${encodeURIComponent(config.providerKey)}&platform=1`}
					mix={[
						css(primaryLinkCss),
						on('click', (event) => {
							event.preventDefault()
							window.location.assign(event.currentTarget.href)
						}),
					]}
				>
					Use the built-in {config.provider} integration instead
				</a>{' '}
				— connecting it replaces this connection&apos;s tokens and scopes.
			</p>
		)
	}

	const shouldShowCompactStatus = () =>
		statusTone === 'error' ||
		statusMessage.toLowerCase().includes('redirecting')

	const renderCompactStatusLine = () => {
		if (!shouldShowCompactStatus()) return null
		return (
			<p
				mix={css(statusTone === 'error' ? compactErrorCss : compactStatusCss)}
				role={statusTone === 'error' ? 'alert' : 'status'}
			>
				{statusMessage}
			</p>
		)
	}

	const renderProviderLogo = () => {
		if (!config) return null
		if (config.platformLogoPath) {
			return (
				<img
					src={config.platformLogoPath}
					alt=""
					width={48}
					height={48}
					mix={css(heroLogoCss)}
				/>
			)
		}
		return (
			<span mix={css(heroLogoWellCss)} aria-hidden="true">
				<ProviderIcon providerId={config.providerKey} size="3rem" />
			</span>
		)
	}

	const renderHeroScopeChips = () => {
		if (!config || config.scopes.length === 0) return null
		return (
			<ul mix={css(scopeChipListCss)}>
				{config.scopes.map((scope) => (
					<li key={scope} mix={css(getBrandChipCss())}>
						{scope}
					</li>
				))}
			</ul>
		)
	}

	const togglePlatformScope = (scope: string, checked: boolean) => {
		if (!config) return
		const allowed = config.platformAllowedScopes ?? []
		if (!allowed.includes(scope)) return
		const nextScopes = checked
			? Array.from(new Set([...config.scopes, scope]))
			: config.scopes.filter((entry) => entry !== scope)
		config = { ...config, scopes: nextScopes }
		update()
	}

	const renderChooseWhatToShareDetails = () => {
		if (!config) return null
		const showPlatformLane =
			Boolean(config.platformAppSlug) &&
			Boolean(config.platformAllowedScopes?.length)
		const showUserLane = !config.platformAppSlug
		if (!showPlatformLane && !showUserLane) return null
		return (
			<details mix={css(disclosureDetailsCss)}>
				<summary mix={css(disclosureSummaryCss)}>Choose what to share</summary>
				<div mix={css(disclosureBodyCss)}>
					{showPlatformLane ? (
						<section>
							<h3 mix={css(disclosureSectionTitleCss)}>Scopes</h3>
							<ul mix={css(scopeCheckboxListCss)}>
								{config.platformAllowedScopes!.map((scope) => {
									const checked = config!.scopes.includes(scope)
									return (
										<li key={scope}>
											<label mix={css(scopeCheckboxLabelCss)}>
												<input
													type="checkbox"
													checked={checked}
													mix={on('change', (event) => {
														togglePlatformScope(
															scope,
															event.currentTarget.checked,
														)
													})}
												/>
												<span>{scope}</span>
											</label>
										</li>
									)
								})}
							</ul>
						</section>
					) : null}
					{showUserLane ? (
						<section>
							<h3 mix={css(disclosureSectionTitleCss)}>Scopes</h3>
							<p mix={css(descriptionCss)}>
								Space-separated OAuth scopes to request during authorization.
							</p>
							<label mix={css(fieldCss)}>
								<span mix={css(fieldLabelCss)}>Requested scopes</span>
								<input
									type="text"
									value={config.scopes.join(' ')}
									{...passwordManagerIgnoreProps}
									mix={[
										on('input', (event) => {
											if (!config) return
											config = {
												...config,
												scopes: parseScopes(event.currentTarget.value),
											}
											update()
										}),
										css(inputCss),
									]}
								/>
							</label>
						</section>
					) : null}
				</div>
			</details>
		)
	}

	const renderSetupWorkbench = () => {
		if (!config) return null
		return (
			<>
				{renderRedirectUriCard()}
				{renderProviderInstructions()}
				{renderAllowedHosts()}
				<form
					{...passwordManagerIgnoreProps}
					mix={[
						on('submit', handleSetupSubmit),
						css({ display: 'grid', gap: spacing.md }),
					]}
				>
					<label mix={css(fieldCss)}>
						<span mix={css(fieldLabelCss)}>Client ID</span>
						<input
							name="oauthClientId"
							required
							{...passwordManagerIgnoreProps}
							value={clientIdInput}
							mix={[
								on('input', (event) => {
									clientIdInput = event.currentTarget.value
									update()
								}),
								css(inputCss),
							]}
						/>
					</label>
					<p mix={css(descriptionCss)}>
						{hasStoredClientId
							? 'Stored on the OAuth app for this connection.'
							: 'Saved on the OAuth app when you finish connecting.'}
					</p>
					{config.flow === 'confidential' ? (
						hasStoredClientSecret && !revealStoredClientSecretField ? (
							<section mix={css(insetCardCss)}>
								<p mix={css({ margin: 0, color: colors.text })}>
									Using the stored client secret in{' '}
									<code>
										{config.clientSecretSecretName ?? 'unknown secret'}
									</code>
									.
								</p>
								<p mix={css(descriptionCss)}>
									You can continue without re-entering it.
								</p>
								<button
									type="button"
									mix={[
										css(secondaryButtonCss),
										on('click', () => {
											revealStoredClientSecretField = true
											update()
										}),
									]}
								>
									Replace stored client secret
								</button>
							</section>
						) : (
							<label mix={css(fieldCss)}>
								<span mix={css(fieldLabelCss)}>Client Secret</span>
								<input
									name="oauthClientSecret"
									type="password"
									required
									{...passwordManagerIgnoreProps}
									value={clientSecretInput}
									mix={[
										on('input', (event) => {
											clientSecretInput = event.currentTarget.value
											update()
										}),
										css(inputCss),
									]}
								/>
							</label>
						)
					) : null}
					<button
						type="submit"
						disabled={submitting}
						mix={css(primaryButtonCss)}
					>
						Save configuration
					</button>
				</form>
				<section mix={css(cardCss)}>
					<h3 mix={css(cardTitleCss)}>Provider details</h3>
					<div mix={css(detailGridCss)}>
						<div mix={css(detailItemCss)}>
							<span mix={css(detailLabelCss)}>Authorize URL</span>
							<code mix={css(detailValueCss)}>{config.authorizeUrl}</code>
						</div>
						<div mix={css(detailItemCss)}>
							<span mix={css(detailLabelCss)}>Token URL</span>
							<code mix={css(detailValueCss)}>{config.tokenUrl}</code>
						</div>
						<div mix={css(detailItemCss)}>
							<span mix={css(detailLabelCss)}>Flow</span>
							<span mix={css(detailValueCss)}>{config.flow}</span>
						</div>
						<div mix={css(detailItemCss)}>
							<span mix={css(detailLabelCss)}>PKCE</span>
							<span mix={css(detailValueCss)}>
								{config.usePkce ? 'S256' : 'off'}
							</span>
						</div>
						<div mix={css(detailItemCss)}>
							<span mix={css(detailLabelCss)}>Scopes</span>
							<span mix={css(detailValueCss)}>
								{config.scopes.length ? config.scopes.join(' ') : 'None'}
							</span>
						</div>
					</div>
					{config.dashboardUrl && isSafeExternalUrl(config.dashboardUrl) ? (
						<a
							href={config.dashboardUrl}
							target="_blank"
							rel="noreferrer noopener"
							mix={css(primaryLinkCss)}
						>
							Open provider dashboard
						</a>
					) : null}
				</section>
				{renderExistingIntegrationConfig()}
			</>
		)
	}

	const renderByoOauthDetails = () => {
		if (!config || config.platformAppSlug) return null
		return (
			<details mix={css(disclosureDetailsCss)} open={currentStep === 'setup'}>
				<summary mix={css(disclosureSummaryCss)}>
					Use your own OAuth app
				</summary>
				<div mix={css(disclosureBodyCss)}>{renderSetupWorkbench()}</div>
			</details>
		)
	}

	const renderHero = () => {
		if (!config) return null
		const lede =
			config.platformDescription?.trim() ||
			`Connect your ${config.provider} account to Kody.`
		const showContinueButton =
			currentStep === 'connect' &&
			!(wouldReplaceDifferentApp() && !replaceConfirmed)
		return (
			<header mix={css(heroHeadCss)}>
				<span mix={css(heroEyebrowCss)} data-rise style={{ '--rise': '0' }}>
					Kody secure connection
				</span>
				<div mix={css(heroTitleRowCss)} data-rise style={{ '--rise': '1' }}>
					{renderProviderLogo()}
					<h1 mix={css(heroTitleCss)}>{config.provider}</h1>
				</div>
				<p mix={css(heroLedeCss)} data-rise style={{ '--rise': '2' }}>
					{lede}
				</p>
				<div data-rise style={{ '--rise': '3' }}>
					{renderHeroScopeChips()}
				</div>
				{renderReplaceConfirmation()}
				{renderBuiltInAlternative()}
				{renderCompactStatusLine()}
				{showContinueButton ? (
					<div mix={css(heroActionsCss)} data-rise style={{ '--rise': '4' }}>
						{existingIntegrationConfig && hasStoredClientId ? (
							<p mix={css(descriptionCss)}>
								Using stored client ID
								{config.flow === 'confidential' && hasStoredClientSecret
									? ` and stored client secret ${config.clientSecretSecretName ?? ''}.`
									: '.'}
							</p>
						) : null}
						<button
							type="button"
							disabled={submitting}
							mix={[
								on('click', () => void handleConnect()),
								css(primaryButtonCss),
							]}
						>
							Continue with {config.provider}
						</button>
						<p mix={css(termsNoteCss)}>
							Connecting authorizes your agent — and any code you run or install
							— to act as you on {config.provider} with the scopes you grant.
							Kody does not control or supervise what your agent does with this
							access; that responsibility is yours. See the{' '}
							<a href="/terms" target="_blank" rel="noreferrer noopener">
								Terms
							</a>
							.
						</p>
					</div>
				) : null}
			</header>
		)
	}

	const renderSuccessState = () => {
		if (!config) return null
		return (
			<section mix={css(successPanelCss)}>
				<h2 mix={css(successTitleCss)}>Connected to {config.provider}</h2>
				<p mix={css(compactStatusCss)}>{statusMessage}</p>
				<div mix={css(successTokenRowCss)}>
					<span>
						Access token saved:{' '}
						<strong>{accessTokenSaved ? 'Yes' : 'No'}</strong>
					</span>
					<span>
						Refresh token saved:{' '}
						<strong>{refreshTokenSaved ? 'Yes' : 'No'}</strong>
					</span>
				</div>
				{hostApprovalLinks.length > 0 ? (
					<div mix={css(successSectionCss)}>
						<p mix={css(descriptionCss)}>
							Hosts are never auto-approved. Approve each token host:
						</p>
						<button
							type="button"
							disabled={approvingAllHosts}
							mix={[
								on('click', () => void approveAllHostApprovals()),
								css(getSecondaryButtonCss()),
							]}
						>
							{approvingAllHosts ? 'Approving hosts…' : 'Approve all hosts'}
						</button>
						<ul mix={css(listCss)}>
							{hostApprovalLinks.map((link) => (
								<li key={`${link.secretName}:${link.host}`}>
									<a
										href={link.approvalUrl}
										target="_blank"
										rel="noreferrer noopener"
										mix={css(primaryLinkCss)}
									>
										Approve <code>{link.host}</code> for{' '}
										<code>{link.secretName}</code>
									</a>
								</li>
							))}
						</ul>
					</div>
				) : null}
				<div mix={css(successSectionCss)}>
					<h3 mix={css(disclosureSectionTitleCss)}>Allowed hosts</h3>
					<ul mix={css(listCss)}>
						{config.allowedHosts.map((host) => (
							<li key={host}>{host}</li>
						))}
					</ul>
					<a
						href="/account/secrets"
						target="_blank"
						rel="noreferrer noopener"
						mix={css(primaryLinkCss)}
					>
						Open account secrets
					</a>
				</div>
				{nextSteps ? (
					<div mix={css(successNextStepsCss)}>
						<p mix={css(descriptionCss)}>{nextSteps.guidance}</p>
						{nextSteps.suggestions.length > 0 ? (
							<ul mix={css(listCss)}>
								{nextSteps.suggestions.map((suggestion) => (
									<li key={suggestion.listingId}>
										<a
											href={suggestion.publicUrl}
											target="_blank"
											rel="noreferrer noopener"
											mix={css(primaryLinkCss)}
										>
											{suggestion.name}
										</a>
										{suggestion.trusted ? (
											<span mix={css(trustedBadgeCss)}>Trusted</span>
										) : null}
										<span mix={css(descriptionCss)}>
											{' '}
											— {suggestion.description}
										</span>
										<div mix={css(suggestionActionsCss)}>
											<CopyTextButton
												value={suggestion.forkPrompt}
												idleLabel="Copy fork prompt"
												variant="secondary"
											/>
										</div>
									</li>
								))}
							</ul>
						) : null}
						<p mix={css(descriptionCss)}>
							{nextSteps.createHelpersCta.label}{' '}
							<CopyTextButton
								value={nextSteps.createHelpersCta.prompt}
								idleLabel="Copy create prompt"
								variant="secondary"
							/>
						</p>
					</div>
				) : null}
			</section>
		)
	}

	const handleConnect = async () => {
		if (!config || submitting) return
		submitting = true
		update()
		try {
			const url = await buildAuthorizeUrl(config)
			window.location.assign(url)
		} catch (error) {
			setStatus(
				formatConnectOauthCaughtError(error, 'Unable to start OAuth.'),
				'error',
			)
		} finally {
			submitting = false
			update()
		}
	}

	const handleCallback = async () => {
		if (!config) return
		setStep('callback')
		try {
			const callback = readCallback()
			if (callback.kind !== 'none') {
				window.history.replaceState(null, '', getRedirectUri())
			}
			if (callback.kind === 'error') {
				setStatus(
					callback.description || `OAuth error: ${callback.error}`,
					'error',
				)
				setStep('connect')
				return
			}
			if (callback.kind !== 'success') return
			const valid = validateState(
				getStateKey(config.providerKey),
				callback.state,
			)
			if (!valid) {
				setStatus('State mismatch. Restart the OAuth flow.', 'error')
				setStep('connect')
				return
			}
			const exchange = await exchangeOAuthCode(config, callback.code)
			if (!exchange.ok) {
				setStatus(exchange.error, 'error')
				setStep(
					exchange.error.includes('client ID') ||
						exchange.error.includes('client secret')
						? 'setup'
						: 'connect',
				)
				return
			}
			const callbackUrl = window.location.href
			const response = await fetch('/account/secrets.json', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({
					action: 'connect_oauth',
					provider: config.provider,
					callbackUrl,
					...(config.platformAppSlug
						? { platformAppSlug: config.platformAppSlug }
						: {}),
					authorizeUrl: config.authorizeUrl,
					tokenUrl: config.tokenUrl,
					apiBaseUrl: config.apiBaseUrl,
					scopes: config.scopes,
					scopeSeparator: config.scopeSeparator,
					extraAuthorizeParams: config.extraAuthorizeParams,
					flow: config.flow,
					usePkce: config.usePkce,
					tokenExchangeStyle: config.tokenExchangeStyle,
					clientId: config.clientId,
					clientSecretSecretName: config.clientSecretSecretName,
					allowedHosts: config.allowedHosts,
					accessTokenSecretName: config.accessTokenSecretName,
					refreshTokenSecretName: config.refreshTokenSecretName,
					tokenPayload: exchange.data,
				}),
			})
			if (redirectToLoginOn401(response)) return
			const payload = await response.json().catch(() => null)
			if (!response.ok || payload?.ok !== true) {
				setStatus(payload?.error || 'Unable to save OAuth tokens.', 'error')
				setStep('connect')
				return
			}
			accessTokenSaved = payload.accessTokenSaved === true
			refreshTokenSaved = payload.refreshTokenSaved === true
			setHostApprovalLinks(parseHostApprovalLinks(payload.hostApprovalLinks))
			setNextSteps(parseConnectOauthNextSteps(payload.nextSteps))
			setStatus('OAuth tokens saved.', 'info')
			setStep('success')
		} catch (error) {
			// Same class as setup submit: token exchange / save fetch failures
			// must surface in-page, not as unhandledrejection (KODY-CLOUDFLARE-3P).
			setStatus(
				formatConnectOauthCaughtError(
					error,
					'Network error. Please try again.',
				),
				'error',
			)
			setStep('connect')
		}
	}

	const renderRedirectUriCard = () => {
		// Built-in apps are registered by the operator; users have nothing to
		// paste into a provider console.
		if (config?.platformAppSlug) return null
		const redirectUri = getRedirectUri()
		if (!redirectUri) return null
		return (
			<section mix={css(redirectUriCardCss)}>
				<h2 mix={css(cardTitleCss)}>Redirect URI</h2>
				<p mix={css({ margin: 0, color: colors.text })}>
					Register this exact URL as the redirect (callback) URI in your
					provider&apos;s OAuth app settings.
				</p>
				<pre mix={css(redirectUriValueCss)}>{redirectUri}</pre>
				<div>
					<CopyTextButton
						value={redirectUri}
						idleLabel="Copy redirect URI"
						variant="primary"
					/>
				</div>
			</section>
		)
	}

	const renderProviderInstructions = () => {
		if (!config) return null
		const instructions = config.providerSetupInstructions
		return (
			<>
				<ol mix={css(listCss)}>
					<li>
						Create an OAuth app in your provider&apos;s developer console.
					</li>
					<li>Register the exact redirect URI shown above.</li>
					<li>Enable any APIs and scopes the integration needs.</li>
					<li>
						Paste the client ID
						{config.flow === 'confidential' && !hasStoredClientSecret
							? ' and client secret'
							: ''}{' '}
						below.
					</li>
				</ol>
				{instructions && instructions.trim() ? (
					<p mix={css({ ...insetCardCss, margin: 0, whiteSpace: 'pre-wrap' })}>
						{instructions}
					</p>
				) : null}
			</>
		)
	}

	const renderAllowedHosts = () => {
		if (!config) return null
		return (
			<section mix={css(insetCardCss)}>
				<h3 mix={css(sectionTitleCss)}>Allowed hosts</h3>
				<p mix={css(descriptionCss)}>
					These hosts will be approved for the saved secrets. Host approvals are
					never automatic.
				</p>
				<ul mix={css(listCss)}>
					{config.allowedHosts.map((host) => (
						<li key={host}>{host}</li>
					))}
				</ul>
			</section>
		)
	}

	const renderExistingIntegrationConfig = () => {
		if (!existingIntegrationConfig) return null
		return (
			<section mix={css(cardCss)}>
				<h2 mix={css(cardTitleCss)}>Existing integration config</h2>
				<p mix={css(descriptionCss)}>
					Loaded your saved connection{' '}
					<code>{existingIntegrationConfig.name}</code>.
				</p>
				<div mix={css(detailGridCss)}>
					<div mix={css(detailItemCss)}>
						<span mix={css(detailLabelCss)}>Flow</span>
						<span mix={css(detailValueCss)}>
							{existingIntegrationConfig.flow}
						</span>
					</div>
					<div mix={css(detailItemCss)}>
						<span mix={css(detailLabelCss)}>Token URL</span>
						<code mix={css(detailValueCss)}>
							{existingIntegrationConfig.tokenUrl}
						</code>
					</div>
					{existingIntegrationConfig.apiBaseUrl ? (
						<div mix={css(detailItemCss)}>
							<span mix={css(detailLabelCss)}>API base URL</span>
							<code mix={css(detailValueCss)}>
								{existingIntegrationConfig.apiBaseUrl}
							</code>
						</div>
					) : null}
					<div mix={css(detailItemCss)}>
						<span mix={css(detailLabelCss)}>Client ID</span>
						<code mix={css(detailValueCss)}>
							{existingIntegrationConfig.clientId}
						</code>
					</div>
					<div mix={css(detailItemCss)}>
						<span mix={css(detailLabelCss)}>Client secret secret</span>
						<code mix={css(detailValueCss)}>
							{existingIntegrationConfig.clientSecretSecretName ?? 'Not used'}
						</code>
					</div>
					<div mix={css(detailItemCss)}>
						<span mix={css(detailLabelCss)}>Access token secret</span>
						<code mix={css(detailValueCss)}>
							{existingIntegrationConfig.accessTokenSecretName}
						</code>
					</div>
					<div mix={css(detailItemCss)}>
						<span mix={css(detailLabelCss)}>Refresh token secret</span>
						<code mix={css(detailValueCss)}>
							{existingIntegrationConfig.refreshTokenSecretName ?? 'Not used'}
						</code>
					</div>
				</div>
				{existingIntegrationConfig.authorization ? (
					<div mix={css(insetCardCss)}>
						<strong mix={css(sectionTitleCss)}>Authorization metadata</strong>
						<div mix={css(detailGridCss)}>
							<div mix={css(detailItemCss)}>
								<span mix={css(detailLabelCss)}>Authorize URL</span>
								<code mix={css(detailValueCss)}>
									{existingIntegrationConfig.authorization.authorizeUrl}
								</code>
							</div>
							<div mix={css(detailItemCss)}>
								<span mix={css(detailLabelCss)}>Scopes</span>
								<span mix={css(detailValueCss)}>
									{existingIntegrationConfig.authorization.scopes.length
										? existingIntegrationConfig.authorization.scopes.join(' ')
										: 'None'}
								</span>
							</div>
						</div>
					</div>
				) : null}
				<div mix={css(insetCardCss)}>
					<strong mix={css(sectionTitleCss)}>Required hosts</strong>
					{existingIntegrationConfig.requiredHosts.length > 0 ? (
						<ul mix={css(listCss)}>
							{existingIntegrationConfig.requiredHosts.map((host) => (
								<li key={host}>{host}</li>
							))}
						</ul>
					) : (
						<p mix={css(descriptionCss)}>None configured.</p>
					)}
				</div>
			</section>
		)
	}

	/**
	 * Resolve config from SSR-embedded / SPA-preloaded loader data during
	 * render, so the page paints its final layout in the same pass that
	 * receives the data — server render included — instead of flashing
	 * "Loading provider configuration…" and shifting content after a
	 * client-side fetch. Callback returns (`code`/`error`) restore their
	 * config from sessionStorage in the queued task; only the redirect URI,
	 * built-in flag, and existing-connection summary apply here.
	 */
	const applyRouteLoaderData = (currentHref: string) => {
		if (routeDataApplied) return
		const url = new URL(currentHref, 'https://kody.local')
		const routeData = tryConsumeRouteLoaderData(
			handle,
			'connectOauth',
			currentHref,
		)
		if (!routeData) return
		routeDataApplied = true
		ssrRedirectUri = routeData.redirectUri ?? null
		builtInAvailable = routeData.builtInAvailable ?? false
		existingConnection = routeData.existingConnection ?? null
		if (url.searchParams.get('code') || url.searchParams.get('error')) {
			return
		}
		const parsed = readQueryConfig(url)
		if (!parsed.ok) {
			hasConfigError = true
			statusMessage = parsed.error
			statusTone = 'error'
			return
		}
		const storedIntegration =
			routeData.provider === parsed.value.providerKey && routeData.integration
				? toStoredIntegrationConfig(routeData.integration)
				: null
		existingIntegrationConfig = storedIntegration
		const nextConfig = mergeConnectOauthConfig({
			queryConfig: parsed.value,
			storedIntegration,
		})
		if (!nextConfig) {
			hasConfigError = true
			statusMessage = 'Missing required OAuth configuration parameters.'
			statusTone = 'error'
			return
		}
		config = nextConfig
		hasStoredClientSecret = routeData.hasStoredClientSecret === true
		applySetupState(nextConfig)
	}

	// Queued from render (once per resolved href): callback handling, the
	// loader-failure fallback refetch, and the built-in auto-start.
	const initializeVisit = async () => {
		if (initialLoadStarted) return
		initialLoadStarted = true
		// Bail after awaits when the user has SPA-navigated to a different
		// connect URL mid-flight: the reset re-queues a fresh task for it.
		const taskHref = resolvedHref
		const hrefStillCurrent = () =>
			taskHref === normalizeConnectHref(readCurrentRouterHref(handle))
		try {
			const callback = readCallback()
			if (callback.kind === 'success' || callback.kind === 'error') {
				const storedConfig = readStoredConfig()
				let nextConfig = storedConfig
				if (!nextConfig) {
					// The sessionStorage snapshot was lost; rebuild from the
					// query (when the provider redirect kept it) plus the
					// stored integration record.
					const parsed = readQueryConfig(new URL(window.location.href))
					nextConfig = parsed.ok
						? mergeConnectOauthConfig({
								queryConfig: parsed.value,
								storedIntegration: await readExistingIntegrationConfig(
									parsed.value,
								),
							})
						: null
				}
				if (!nextConfig) {
					setStatus('Missing required OAuth configuration parameters.', 'error')
					return
				}
				config = nextConfig
				if (!connectOauthHandled) {
					connectOauthHandled = true
					await handleCallback()
				}
				return
			}
			if (!config && !hasConfigError) {
				// The navigation committed without loader data (loader
				// failure or an aborted prefetch): fall back to the same
				// fetch the loader performs.
				const parsed = readQueryConfig(new URL(window.location.href))
				if (!parsed.ok) {
					hasConfigError = true
					setStatus(parsed.error, 'error')
					return
				}
				const existingIntegration = await readExistingIntegrationConfig(
					parsed.value,
				)
				if (!hrefStillCurrent()) return
				existingIntegrationConfig = existingIntegration
				const nextConfig = mergeConnectOauthConfig({
					queryConfig: parsed.value,
					storedIntegration: existingIntegration,
				})
				if (!nextConfig) {
					hasConfigError = true
					setStatus('Missing required OAuth configuration parameters.', 'error')
					return
				}
				config = nextConfig
				applySetupState(nextConfig)
				update()
			}
			// Built-in integrations have nothing for the user to review or
			// fill in, so a plain ?provider=<slug> visit (the onboarding
			// cards, docs links) goes straight into the provider's authorize
			// flow. Callback returns never reach this branch — code and
			// error visits take the callback path — so a denial cannot
			// loop back into an auto-start. A flow that would replace a
			// different-app connection never auto-starts: the user confirms
			// or renames first.
			if (
				hrefStillCurrent() &&
				config?.platformAppSlug &&
				currentStep === 'connect' &&
				!wouldReplaceDifferentApp()
			) {
				setStatus(`Redirecting to ${config.provider} to authorize…`)
				await handleConnect()
			}
		} catch (error) {
			// Initial integration reads use fetch(); a transient network
			// failure must not escape queueTask as unhandledrejection.
			setStatus(
				formatConnectOauthCaughtError(
					error,
					'Network error. Please try again.',
				),
				'error',
			)
		}
	}

	return () => {
		const currentHref = readCurrentRouterHref(handle)
		const normalizedHref = normalizeConnectHref(currentHref)
		// An in-app navigation to a different connect URL (another provider,
		// a platform lane switch) re-resolves from scratch instead of keeping
		// the previous provider's page. Callback flows are terminal — their
		// URL is rewritten via history.replaceState — and never reset.
		if (
			resolvedHref !== null &&
			resolvedHref !== normalizedHref &&
			!connectOauthHandled
		) {
			resetResolutionState()
		}
		if (resolvedHref === null) {
			resolvedHref = normalizedHref
		}
		applyRouteLoaderData(currentHref)
		if (!initialLoadStarted && typeof document !== 'undefined') {
			handle.queueTask(initializeVisit)
		}
		if (!config) {
			return (
				<section mix={css(pageCss)}>
					<header mix={css(heroHeadCss)}>
						<span mix={css(heroEyebrowCss)}>Kody secure connection</span>
						<h1 mix={css(heroTitleCss)}>Connect OAuth</h1>
						<p mix={css(hasConfigError ? compactErrorCss : heroLedeCss)}>
							{statusMessage}
						</p>
					</header>
					{ssrRedirectUri ? (
						<details mix={css(disclosureDetailsCss)}>
							<summary mix={css(disclosureSummaryCss)}>
								Use your own OAuth app
							</summary>
							<div mix={css(disclosureBodyCss)}>
								<section mix={css(redirectUriCardCss)}>
									<h2 mix={css(cardTitleCss)}>Redirect URI</h2>
									<p mix={css({ margin: 0, color: colors.text })}>
										Register this exact URL as the redirect (callback) URI in
										your provider&apos;s OAuth app settings.
									</p>
									<pre mix={css(redirectUriValueCss)}>{ssrRedirectUri}</pre>
									<div>
										<CopyTextButton
											value={ssrRedirectUri}
											idleLabel="Copy redirect URI"
											variant="primary"
										/>
									</div>
								</section>
							</div>
						</details>
					) : null}
				</section>
			)
		}
		if (currentStep === 'success') {
			return <section mix={css(pageCss)}>{renderSuccessState()}</section>
		}
		return (
			<section mix={css(pageCss)}>
				{renderHero()}
				{renderChooseWhatToShareDetails()}
				{renderByoOauthDetails()}
			</section>
		)
	}
}

const pageCss = {
	...stackedPageCss,
	maxWidth: '56rem',
	margin: '0 auto',
	padding:
		'clamp(2.5rem, 6vw, 4.5rem) clamp(1.25rem, 4vw, 2.5rem) clamp(3rem, 7vw, 5rem)',
}

const heroHeadCss = {
	position: 'relative' as const,
	isolation: 'isolate' as const,
	display: 'grid',
	gap: spacing.md,
	'&::before': {
		content: '""',
		position: 'absolute' as const,
		zIndex: -1,
		inset: '-60% -12% -140%',
		background: `radial-gradient(ellipse 42% 58% at 68% 40%, oklch(from ${colors.text} l c h / 0.05), transparent 72%)`,
		maskImage: 'var(--kody-pattern)',
		maskPosition: 'center',
		maskSize: '340px',
		maskRepeat: 'repeat',
		WebkitMaskImage: 'var(--kody-pattern)',
		WebkitMaskPosition: 'center',
		WebkitMaskSize: '340px',
		WebkitMaskRepeat: 'repeat',
		pointerEvents: 'none' as const,
	},
}

const heroEyebrowCss = {
	font: `700 0.78rem/1 ${typography.fontFamilyDisplay}`,
	textTransform: 'uppercase' as const,
	letterSpacing: '0.09em',
	color: colors.primaryText,
}

const heroTitleRowCss = {
	display: 'flex',
	alignItems: 'center',
	gap: spacing.md,
	flexWrap: 'wrap' as const,
}

const heroTitleCss = {
	margin: 0,
	font: `760 clamp(2rem, 4vw, 2.8rem)/1.04 ${typography.fontFamilyDisplay}`,
	letterSpacing: '-0.028em',
	color: colors.text,
}

const heroLedeCss = {
	margin: 0,
	color: colors.textMuted,
	fontSize: '1.08rem',
	maxWidth: '52ch',
}

const heroLogoCss = {
	borderRadius: radius.sm,
	flex: 'none',
}

const heroLogoWellCss = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	flex: 'none',
}

const scopeChipListCss = {
	display: 'flex',
	flexWrap: 'wrap' as const,
	gap: spacing.sm,
	margin: 0,
	padding: 0,
	listStyle: 'none',
}

const heroActionsCss = {
	display: 'grid',
	gap: spacing.md,
	marginTop: spacing.sm,
}

const termsNoteCss = {
	margin: 0,
	color: colors.textMuted,
	fontSize: typography.fontSize.sm,
	maxWidth: '58ch',
}

const builtInAlternativeCss = {
	margin: 0,
	color: colors.textMuted,
	fontSize: typography.fontSize.sm,
	maxWidth: '58ch',
}

const replaceCalloutCss = {
	...insetCardCss,
	display: 'grid',
	gap: spacing.sm,
}

const compactStatusCss = {
	margin: 0,
	color: colors.textMuted,
	fontSize: typography.fontSize.sm,
}

const compactErrorCss = {
	margin: 0,
	color: colors.error,
	fontSize: typography.fontSize.sm,
}

const disclosureDetailsCss = {
	marginTop: 'clamp(1.5rem, 4vw, 2.5rem)',
	paddingTop: '1.2rem',
	borderTop: `1px solid ${colors.border}`,
	'& > div': {
		'@media (prefers-reduced-motion: no-preference)': {
			transition: `opacity 240ms ${transitions.easeOut}, translate 240ms ${transitions.easeOut}`,
		},
		'@starting-style': {
			opacity: 0,
			translate: '0 6px',
		},
	},
}

const disclosureSummaryCss = {
	cursor: 'pointer',
	width: 'fit-content',
	padding: '0.3rem 0',
	font: `700 1.05rem/1.3 ${typography.fontFamilyDisplay}`,
	color: colors.text,
	transition: `color ${transitions.fast}`,
	[hoverMq]: {
		'&:hover': {
			color: colors.primaryText,
		},
	},
}

const disclosureBodyCss = {
	marginTop: '1.2rem',
	display: 'grid',
	gap: spacing.lg,
	minWidth: 0,
	'& > *': { minWidth: 0 },
}

const disclosureSectionTitleCss = {
	margin: '0 0 0.5rem',
	font: `700 0.95rem/1.3 ${typography.fontFamilyDisplay}`,
	color: colors.text,
}

const scopeCheckboxListCss = {
	...listCss,
	display: 'grid',
	gap: spacing.sm,
}

const scopeCheckboxLabelCss = {
	display: 'flex',
	alignItems: 'flex-start',
	gap: spacing.sm,
	color: colors.text,
	cursor: 'pointer',
}

const successPanelCss = {
	display: 'grid',
	gap: spacing.lg,
}

const successTitleCss = {
	margin: 0,
	font: `720 clamp(1.6rem, 3vw, 2.2rem)/1.1 ${typography.fontFamilyDisplay}`,
	letterSpacing: '-0.02em',
}

const successTokenRowCss = {
	display: 'flex',
	flexWrap: 'wrap' as const,
	gap: spacing.md,
	color: colors.text,
}

const successSectionCss = {
	display: 'grid',
	gap: spacing.sm,
}

const successNextStepsCss = {
	display: 'grid',
	gap: spacing.sm,
	paddingTop: spacing.sm,
	borderTop: `1px solid ${colors.border}`,
}

const redirectUriCardCss = {
	...cardCss,
	border: `1px solid ${colors.primary}`,
}

const redirectUriValueCss = {
	...insetCardCss,
	margin: 0,
	whiteSpace: 'pre-wrap' as const,
	wordBreak: 'break-all' as const,
	fontFamily: 'monospace',
	fontSize: typography.fontSize.base,
	fontWeight: typography.fontWeight.medium,
}

const primaryButtonCss = getPrimaryButtonCss({
	size: 'lg',
	weight: 'semibold',
})

const secondaryButtonCss = getSecondaryButtonCss({
	size: 'lg',
	weight: 'semibold',
})

const suggestionActionsCss = {
	display: 'flex',
	flexWrap: 'wrap' as const,
	alignItems: 'center',
	gap: spacing.sm,
	marginTop: spacing.sm,
}

const trustedBadgeCss = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: `0.15rem ${spacing.sm}`,
	borderRadius: radius.md,
	backgroundColor: colors.primarySoftest,
	color: colors.primaryText,
	fontSize: typography.fontSize.xs,
	fontWeight: typography.fontWeight.semibold,
}
