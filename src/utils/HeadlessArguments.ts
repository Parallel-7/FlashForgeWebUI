/**
 * @fileoverview CLI argument parser for standalone WebUI server
 *
 * Parses and validates command-line arguments for running FlashForgeWebUI.
 * Supports single printer, multiple printers, last-used printer, and all saved printers.
 *
 * Examples:
 *   node dist/index.js --last-used
 *   node dist/index.js --all-saved-printers
 *   node dist/index.js --printers="192.168.1.100:new:12345678,192.168.1.101:legacy"
 *   node dist/index.js --webui-port=3001 --webui-password=mypassword
 */

import type { PrinterClientType } from '../types/printer';

/**
 * Specification for a single printer connection
 */
export interface PrinterSpec {
  ip: string;
  type: PrinterClientType;
  checkCode?: string;
}

/**
 * Configuration parsed from CLI arguments
 */
export interface HeadlessConfig {
  mode: 'last-used' | 'all-saved' | 'explicit-printers' | 'no-printers';
  printers?: PrinterSpec[]; // For explicit printer specifications
  webUIPort?: number;
  webUIPassword?: string;
}

/**
 * Validation result for configuration
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Parse command-line arguments to extract configuration
 *
 * @returns HeadlessConfig with parsed arguments
 */
export function parseHeadlessArguments(): HeadlessConfig {
  const args = process.argv;

  // Determine mode
  const hasLastUsed = args.includes('--last-used');
  const hasAllSaved = args.includes('--all-saved-printers');
  const printersArg = args.find((arg) => arg.startsWith('--printers='));
  const hasNoPrinters = args.includes('--no-printers');

  let mode: HeadlessConfig['mode'];
  let printers: PrinterSpec[] | undefined;

  if (hasNoPrinters) {
    // Start server without connecting to any printers (WebUI only)
    mode = 'no-printers';
  } else if (hasLastUsed) {
    mode = 'last-used';
  } else if (hasAllSaved) {
    mode = 'all-saved';
  } else if (printersArg) {
    mode = 'explicit-printers';
    printers = parsePrintersArgument(printersArg);
  } else {
    // Default to no-printers if no mode specified
    mode = 'no-printers';
  }

  // Parse optional overrides
  const webUIPort = parseNumberArgument(args, '--webui-port');
  const webUIPassword = parseStringArgument(args, '--webui-password');

  return {
    mode,
    printers,
    webUIPort,
    webUIPassword,
  };
}

/**
 * Parse --printers argument into array of PrinterSpec
 *
 * Format: --printers="192.168.1.100:new:12345678,192.168.1.101:legacy"
 *
 * @param arg The --printers= argument string
 * @returns Array of PrinterSpec objects
 */
function parsePrintersArgument(arg: string): PrinterSpec[] {
  const value = arg.split('=')[1];
  if (!value) {
    return [];
  }

  // Remove quotes if present
  const cleanValue = value.replace(/^["']|["']$/g, '');

  // Split by comma to get individual printer specs
  const printerStrings = cleanValue.split(',');

  const specs: PrinterSpec[] = [];

  for (const printerStr of printerStrings) {
    const parts = printerStr.trim().split(':');
    if (parts.length < 2) {
      continue;
    }

    const [ip, typeStr, checkCode] = parts;
    const type: PrinterClientType = typeStr === 'new' ? 'new' : 'legacy';

    specs.push({
      ip: ip.trim(),
      type,
      checkCode: checkCode?.trim(),
    });
  }

  return specs;
}

/**
 * Parse a number argument from command-line args
 *
 * @param args Process argv array
 * @param flag Flag to search for (e.g., '--webui-port')
 * @returns Parsed number or undefined
 */
function parseNumberArgument(args: string[], flag: string): number | undefined {
  const arg = args.find((a) => a.startsWith(`${flag}=`));
  if (!arg) {
    return undefined;
  }

  const value = arg.split('=')[1];
  const parsed = parseInt(value, 10);

  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse a string argument from command-line args
 *
 * @param args Process argv array
 * @param flag Flag to search for (e.g., '--webui-password')
 * @returns Parsed string or undefined
 */
function parseStringArgument(args: string[], flag: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`${flag}=`));
  if (!arg) {
    return undefined;
  }

  const value = arg.split('=')[1];
  // Remove quotes if present
  return value?.replace(/^["']|["']$/g, '');
}

/**
 * Validate configuration
 *
 * @param config HeadlessConfig to validate
 * @returns ValidationResult with errors if any
 */
export function validateHeadlessConfig(config: HeadlessConfig): ValidationResult {
  const errors: string[] = [];

  // Validate mode-specific requirements
  if (config.mode === 'explicit-printers') {
    if (!config.printers || config.printers.length === 0) {
      errors.push('No printers specified for explicit-printers mode');
    } else {
      // Validate each printer spec
      config.printers.forEach((printer, index) => {
        if (!printer.ip) {
          errors.push(`Printer ${index + 1}: Missing IP address`);
        }
        if (!printer.type) {
          errors.push(`Printer ${index + 1}: Missing printer type`);
        }
        if (printer.type === 'new' && !printer.checkCode) {
          errors.push(`Printer ${index + 1}: New printer type requires check code`);
        }
      });
    }
  }

  // Validate optional overrides
  if (config.webUIPort !== undefined) {
    if (config.webUIPort < 1 || config.webUIPort > 65535) {
      errors.push('WebUI port must be between 1 and 65535');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
