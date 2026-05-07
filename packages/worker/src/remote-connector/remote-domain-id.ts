import { type RemoteConnectorRef } from '@kody-internal/shared/remote-connectors.ts'

export function remoteConnectorDomainId(ref: RemoteConnectorRef): string {
	const k = ref.kind.trim().toLowerCase()
	const id =
		ref.instanceId
			.trim()
			.replaceAll(/[^\w-]+/g, '_')
			.replaceAll(/_+/g, '_')
			.replace(/^_|_$/g, '') || 'instance'
	return `remote:${k}:${id}`
}

export function remoteConnectorCapabilityPrefix(
	ref: RemoteConnectorRef,
): string {
	const k = ref.kind.trim().toLowerCase()
	const rawId = ref.instanceId.trim()
	const slug =
		rawId
			.replaceAll(/[^\w]+/g, '_')
			.replaceAll(/_+/g, '_')
			.replace(/^_|_$/g, '') || 'instance'

	return `${k}_${slug}`
}
