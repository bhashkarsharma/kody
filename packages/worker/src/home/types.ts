import {
	type ConnectorHelloMessage,
	type ConnectorHeartbeatMessage,
	type ConnectorJsonRpcEnvelope,
	type ConnectorSnapshot,
	type ConnectorToolDescriptor,
	type KodyConnectorAckMessage,
	type KodyConnectorErrorMessage,
	type KodyConnectorPingMessage,
	type KodyToConnectorMessage,
} from '@kody-bot/connector-kit/protocol'
import {
	type JSONRPCErrorResponse,
	type JSONRPCMessage,
	type JSONRPCRequest,
	type JSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js'

export type HomeToolDescriptor = ConnectorToolDescriptor

export type HomeConnectorSnapshot = ConnectorSnapshot

export type HomeConnectorHelloMessage = ConnectorHelloMessage

export type HomeConnectorHeartbeatMessage = ConnectorHeartbeatMessage

export type HomeConnectorJsonRpcEnvelope = Omit<
	ConnectorJsonRpcEnvelope,
	'message'
> & {
	message: JSONRPCMessage
}

export type HomeConnectorServerMessage =
	| HomeConnectorHelloMessage
	| HomeConnectorHeartbeatMessage
	| HomeConnectorJsonRpcEnvelope

export type HomeConnectorAckMessage = KodyConnectorAckMessage

export type HomeConnectorErrorMessage = KodyConnectorErrorMessage

export type HomeConnectorPingMessage = KodyConnectorPingMessage

export type HomeConnectorClientMessage = KodyToConnectorMessage

export type HomeConnectorPersistedState = {
	connectorId: string | null
	/** Persisted connector kind; null means legacy sessions (treated as `home`). */
	connectorKind: string | null
	connectedAt: string | null
	lastSeenAt: string | null
}

export type HomeConnectorJsonRpcResponse =
	| JSONRPCResultResponse
	| JSONRPCErrorResponse

export type HomeConnectorJsonRpcRequest = JSONRPCRequest
