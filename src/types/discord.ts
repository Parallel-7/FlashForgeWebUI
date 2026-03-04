/**
 * @fileoverview Discord webhook integration type definitions.
 *
 * Defines the payload and configuration types used by the standalone
 * Discord notification service.
 */

/**
 * Discord embed field.
 */
export interface DiscordEmbedField {
  readonly name: string;
  readonly value: string;
  readonly inline: boolean;
}

/**
 * Discord embed structure.
 */
export interface DiscordEmbed {
  readonly title: string;
  readonly color: number;
  readonly timestamp: string;
  readonly fields: DiscordEmbedField[];
}

/**
 * Discord webhook POST payload.
 */
export interface DiscordWebhookPayload {
  readonly embeds: DiscordEmbed[];
}

/**
 * Discord-specific service configuration.
 */
export interface DiscordServiceConfig {
  readonly enabled: boolean;
  readonly webhookUrl: string;
  readonly updateIntervalMinutes: number;
}
