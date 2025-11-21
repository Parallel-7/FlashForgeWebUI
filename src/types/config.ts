/**
 * @fileoverview Application configuration type definitions for standalone WebUI
 *
 * Simplified configuration schema focused on WebUI, Spoolman, and camera features.
 * Removes Electron-specific properties (desktop UI, notifications, auto-update).
 *
 * Key Features:
 * - AppConfig interface with readonly properties for immutability
 * - MutableAppConfig for internal modification scenarios
 * - DEFAULT_CONFIG with type-safe constant values
 * - Configuration validation with isValidConfig type guard
 * - Sanitization function for safe config loading
 * - ConfigUpdateEvent for change tracking and listeners
 * - Port number validation (1-65535 range)
 *
 * Configuration Categories:
 * - WebUI Server: WebUIEnabled, WebUIPort, WebUIPassword, WebUIPasswordRequired
 * - Camera: CustomCamera, CustomCameraUrl, CameraProxyPort
 * - Spoolman: SpoolmanEnabled, SpoolmanServerUrl, SpoolmanUpdateMode
 * - Advanced: CustomLeds, ForceLegacyAPI, DebugMode
 * - Theme: WebUITheme
 *
 * @module types/config
 */

/**
 * Theme color configuration
 * Defines the color palette for the WebUI
 */
export interface ThemeColors {
  primary: string;    // Main accent color (used for buttons, highlights)
  secondary: string;  // Secondary accent color or gradient end
  background: string; // Base background color
  surface: string;    // Card/panel background
  text: string;       // Primary text color
}

/**
 * Application configuration interface
 * All properties are readonly to enforce immutability
 */
export interface AppConfig {
  // WebUI Server
  readonly WebUIEnabled: boolean;
  readonly WebUIPort: number;
  readonly WebUIPassword: string;
  readonly WebUIPasswordRequired: boolean;

  // Camera
  readonly CustomCamera: boolean;
  readonly CustomCameraUrl: string;
  readonly CameraProxyPort: number;

  // Spoolman Integration
  readonly SpoolmanEnabled: boolean;
  readonly SpoolmanServerUrl: string;
  readonly SpoolmanUpdateMode: 'length' | 'weight';

  // Advanced
  readonly CustomLeds: boolean;
  readonly ForceLegacyAPI: boolean;
  readonly DebugMode: boolean;

  // Theme
  readonly WebUITheme: ThemeColors;
}

/**
 * Mutable version of AppConfig for internal modifications
 */
export interface MutableAppConfig {
  WebUIEnabled: boolean;
  WebUIPort: number;
  WebUIPassword: string;
  WebUIPasswordRequired: boolean;
  CustomCamera: boolean;
  CustomCameraUrl: string;
  CameraProxyPort: number;
  SpoolmanEnabled: boolean;
  SpoolmanServerUrl: string;
  SpoolmanUpdateMode: 'length' | 'weight';
  CustomLeds: boolean;
  ForceLegacyAPI: boolean;
  DebugMode: boolean;
  WebUITheme: ThemeColors;
}

/**
 * Default theme colors - dark theme matching WebUI
 */
export const DEFAULT_THEME: ThemeColors = {
  primary: '#4285f4',     // accent blue
  secondary: '#357abd',   // gradient end
  background: '#121212',  // dark base
  surface: '#1e1e1e',     // card background
  text: '#e0e0e0',        // light text
};

/**
 * Default configuration values for standalone WebUI
 */
export const DEFAULT_CONFIG: AppConfig = {
  // WebUI Server (always enabled in standalone)
  WebUIEnabled: true,
  WebUIPort: 3000,
  WebUIPassword: 'changeme',
  WebUIPasswordRequired: true,

  // Camera
  CustomCamera: false,
  CustomCameraUrl: '',
  CameraProxyPort: 8181,

  // Spoolman
  SpoolmanEnabled: false,
  SpoolmanServerUrl: '',
  SpoolmanUpdateMode: 'weight',

  // Advanced
  CustomLeds: false,
  ForceLegacyAPI: false,
  DebugMode: false,

  // Theme
  WebUITheme: DEFAULT_THEME,
} as const;

/**
 * Configuration update event data
 */
export interface ConfigUpdateEvent {
  readonly previous: Readonly<AppConfig>;
  readonly current: Readonly<AppConfig>;
  readonly changedKeys: ReadonlyArray<keyof AppConfig>;
}

/**
 * Type guard to validate config key
 */
export function isValidConfigKey(key: string): key is keyof AppConfig {
  return key in DEFAULT_CONFIG;
}

/**
 * Type guard to validate an entire config object
 */
export function isValidConfig(config: unknown): config is AppConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const obj = config as Record<string, unknown>;

  // Check all required keys exist and have correct types
  for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
    if (!(key in obj)) {
      return false;
    }

    const value = obj[key];
    const expectedType = typeof defaultValue;

    if (typeof value !== expectedType) {
      return false;
    }

    // Additional validation for specific types
    if (expectedType === 'number' && (!Number.isFinite(value) || (value as number) < 0)) {
      return false;
    }
  }

  return true;
}

/**
 * Type-safe assignment helper for configuration properties
 */
function assignConfigValue<K extends keyof MutableAppConfig>(
  config: MutableAppConfig,
  key: K,
  value: MutableAppConfig[K]
): void {
  config[key] = value;
}

/**
 * Validates that a value is a valid 6-digit hex color code
 */
function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#([0-9a-fA-F]{6})$/.test(value);
}

/**
 * Sanitizes a theme object, ensuring all colors are valid hex codes
 * Falls back to default theme values for invalid colors
 */
export function sanitizeTheme(theme: Partial<ThemeColors> | undefined): ThemeColors {
  const result: ThemeColors = { ...DEFAULT_THEME };
  if (!theme) return result;

  if (isValidHexColor(theme.primary)) result.primary = theme.primary;
  if (isValidHexColor(theme.secondary)) result.secondary = theme.secondary;
  if (isValidHexColor(theme.background)) result.background = theme.background;
  if (isValidHexColor(theme.surface)) result.surface = theme.surface;
  if (isValidHexColor(theme.text)) result.text = theme.text;

  return result;
}

/**
 * Sanitizes and ensures a config object contains only valid keys with correct types
 */
export function sanitizeConfig(config: Partial<AppConfig>): AppConfig {
  const sanitized: MutableAppConfig = { ...DEFAULT_CONFIG };

  for (const [key, value] of Object.entries(config)) {
    if (isValidConfigKey(key)) {
      const defaultValue = DEFAULT_CONFIG[key];
      const expectedType = typeof defaultValue;

      if (typeof value === expectedType) {
        if (expectedType === 'number') {
          // Ensure numbers are valid and within reasonable bounds
          const numValue = value as number;
          if (Number.isFinite(numValue) && numValue >= 0) {
            if (key === 'WebUIPort' || key === 'CameraProxyPort') {
              // Validate port numbers
              if (numValue >= 1 && numValue <= 65535) {
                assignConfigValue(sanitized, key, numValue);
              }
            } else {
              assignConfigValue(sanitized, key, numValue);
            }
          }
        } else if (expectedType === 'string') {
          if (key === 'SpoolmanUpdateMode') {
            const mode = value as string;
            if (mode === 'length' || mode === 'weight') {
              assignConfigValue(sanitized, key, mode);
            }
          } else {
            assignConfigValue(sanitized, key, value as MutableAppConfig[typeof key]);
          }
        } else {
          assignConfigValue(sanitized, key, value as MutableAppConfig[typeof key]);
        }
      }
    }
  }

  // Sanitize theme object separately
  if (config.WebUITheme) {
    sanitized.WebUITheme = sanitizeTheme(config.WebUITheme);
  }

  return sanitized;
}
