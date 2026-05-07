import { type InferOutput } from 'remix/data-schema'
import { type mcpCallerContextSchema } from './chat.ts'

type McpCallerContext = InferOutput<typeof mcpCallerContextSchema>

export type RemoteConnectorRef = {
	kind: string
	instanceId: string
}

function normalizeKind(kind: string): string {
	return kind.trim().toLowerCase()
}

function normalizeInstanceId(instanceId: string): string {
	return instanceId.trim()
}

export function normalizeRemoteConnectorRefs(
	context: Pick<McpCallerContext, 'remoteConnectors'>,
): Array<RemoteConnectorRef> {
	return (context.remoteConnectors ?? [])
		.map((ref) => ({
			kind: normalizeKind(ref.kind),
			instanceId: normalizeInstanceId(ref.instanceId),
		}))
		.filter((ref) => ref.kind.length > 0 && ref.instanceId.length > 0)
}
