import {
	type RemoteConnectorClientMessage,
	type RemoteConnectorJsonRpcEnvelope,
	type RemoteConnectorServerMessage,
} from './types.ts'
import {
	isConnectorJsonRpcEnvelope,
	parseConnectorMessage,
	stringifyConnectorMessage,
} from '@kody-bot/connector-kit/protocol'
import {
	type JSONRPCErrorResponse,
	type JSONRPCMessage,
	type JSONRPCRequest,
	type JSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js'

export function jsonResponse(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			...init?.headers,
		},
	})
}

export function isJsonRpcEnvelope(
	value: RemoteConnectorServerMessage,
): value is RemoteConnectorJsonRpcEnvelope {
	return isConnectorJsonRpcEnvelope(
		value as Parameters<typeof isConnectorJsonRpcEnvelope>[0],
	)
}

export function parseRemoteConnectorMessage(
	raw: string | ArrayBuffer,
): RemoteConnectorServerMessage {
	return parseConnectorMessage(raw) as RemoteConnectorServerMessage
}

export function stringifyRemoteConnectorMessage(
	message: RemoteConnectorServerMessage | RemoteConnectorClientMessage,
) {
	return stringifyConnectorMessage(
		message as Parameters<typeof stringifyConnectorMessage>[0],
	)
}

export function createJsonRpcRequest(
	id: string,
	method: string,
	params: Record<string, unknown>,
): JSONRPCRequest {
	return {
		jsonrpc: '2.0',
		id,
		method,
		params,
	}
}

export function createJsonRpcResultResponse(
	id: string | number,
	result: Record<string, unknown>,
): JSONRPCResultResponse {
	return {
		jsonrpc: '2.0',
		id,
		result,
	}
}

export function createJsonRpcErrorResponse(
	id: string | number | undefined,
	code: number,
	message: string,
): JSONRPCErrorResponse {
	return {
		jsonrpc: '2.0',
		id,
		error: {
			code,
			message,
		},
	}
}

export function parseJsonRpcMessage(message: JSONRPCMessage) {
	return message
}
