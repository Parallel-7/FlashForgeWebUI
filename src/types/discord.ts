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
 * Discord embed image structure.
 */
export interface DiscordEmbedImage {
  readonly url: string;
}

/**
 * Discord embed structure.
 */
export interface DiscordEmbed {
  readonly title: string;
  readonly description?: string;
  readonly color: number;
  readonly timestamp: string;
  readonly fields: DiscordEmbedField[];
  readonly image?: DiscordEmbedImage;
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
  readonly includeCameraSnapshots: boolean;
  readonly webhookUrl: string;
  readonly updateIntervalMinutes: number;
}
