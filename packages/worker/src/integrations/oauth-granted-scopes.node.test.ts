import { expect, test } from 'vitest'
import { resolvePersistedOauthScopes } from '#worker/integrations/oauth-granted-scopes.ts'

test('resolvePersistedOauthScopes prefers granted scopes from the token response', () => {
	expect(
		resolvePersistedOauthScopes({
			requestedScopes: [
				'https://www.googleapis.com/auth/drive',
				'https://www.googleapis.com/auth/drive.readonly',
			],
			tokenPayload: {
				access_token: 'tok',
				scope: 'https://www.googleapis.com/auth/drive.readonly',
			},
		}),
	).toEqual(['https://www.googleapis.com/auth/drive.readonly'])

	expect(
		resolvePersistedOauthScopes({
			requestedScopes: ['a', 'b', 'c'],
			tokenPayload: { access_token: 'tok', scope: 'a,c' },
		}),
	).toEqual(['a', 'c'])
})

test('resolvePersistedOauthScopes falls back to requested scopes when grant is missing', () => {
	const requested = ['repo', 'read:user']
	expect(
		resolvePersistedOauthScopes({
			requestedScopes: requested,
			tokenPayload: { access_token: 'tok' },
		}),
	).toEqual(requested)
	expect(
		resolvePersistedOauthScopes({
			requestedScopes: requested,
			tokenPayload: { access_token: 'tok', scope: '   ' },
		}),
	).toEqual(requested)
	expect(
		resolvePersistedOauthScopes({
			requestedScopes: requested,
			tokenPayload: { access_token: 'tok', scope: 12 as unknown as string },
		}),
	).toEqual(requested)
})
