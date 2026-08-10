/**
 * Prefer the scopes the provider actually granted when the token response
 * includes a `scope` field (RFC 6749). Google granular consent can return a
 * subset of what was requested; persisting the request would overstate access.
 * When the field is absent or empty, keep the requested scopes.
 */
export function resolvePersistedOauthScopes(input: {
	requestedScopes: Array<string>
	tokenPayload: Record<string, unknown>
}): Array<string> {
	const raw = input.tokenPayload.scope
	if (typeof raw !== 'string') return input.requestedScopes
	const granted = raw
		.split(/[\s,]+/)
		.map((scope) => scope.trim())
		.filter(Boolean)
	return granted.length > 0 ? granted : input.requestedScopes
}
