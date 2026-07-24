import { z } from 'zod'
import { defineDomainCapability } from '#mcp/capabilities/define-domain-capability.ts'
import { capabilityDomainNames } from '#mcp/capabilities/domain-metadata.ts'
import { requireMcpUser } from '#mcp/capabilities/meta/require-user.ts'
import { listWebhookDeliveriesForUser } from '#worker/webhooks/service.ts'
import {
	requirePackageRef,
	toDeliveryCapability,
	webhookDeliverySchema,
	webhookPackageRefSchema,
} from './shared.ts'

export const webhookDeliveryListCapability = defineDomainCapability(
	capabilityDomainNames.webhooks,
	{
		name: 'webhook_delivery_list',
		description:
			'List recent inbound webhook deliveries for one minted package webhook (metadata only; payload bodies are never stored).',
		keywords: ['webhook', 'delivery', 'log', 'debug', 'history'],
		readOnly: true,
		idempotent: true,
		destructive: false,
		inputSchema: z
			.object({
				...webhookPackageRefSchema,
				webhookName: z.string().min(1),
				limit: z.number().int().min(1).max(50).optional(),
			})
			.superRefine((input, ctx) => {
				try {
					requirePackageRef(input)
				} catch (error) {
					ctx.addIssue({
						code: 'custom',
						path: ['packageId'],
						message:
							error instanceof Error ? error.message : 'Invalid package ref.',
					})
				}
			}),
		outputSchema: z.object({
			deliveries: z.array(webhookDeliverySchema),
		}),
		async handler(args, ctx) {
			const user = requireMcpUser(ctx.callerContext)
			const deliveries = await listWebhookDeliveriesForUser({
				env: ctx.env,
				userId: user.userId,
				packageId: args.packageId,
				kodyId: args.kodyId,
				webhookName: args.webhookName,
				limit: args.limit,
			})
			return { deliveries: deliveries.map(toDeliveryCapability) }
		},
	},
)
