/**
 * @fileoverview Shared emulator scenario definitions and seeded-printer helpers for standalone WebUI E2E.
 */

import type { PrinterClientType, PrinterModelType } from '../../src/types/printer';
import type { EmulatorMaterialMapping, EmulatorModel } from './emulator-harness';
import type { SeededPrinterDetailsEntry } from './standalone-server-harness';

const MODERN_CHECK_CODE = '12345678';
const LEGACY_CHECK_CODE = '123';

export interface LifecycleScenario {
  readonly label: string;
  readonly model: EmulatorModel;
  readonly printerModel: string;
  readonly modelType: PrinterModelType;
  readonly clientType: PrinterClientType;
  readonly serial: string;
  readonly machineName: string;
  readonly checkCode: string;
  readonly supportsLedControls: boolean;
  readonly supportsFiltration: boolean;
  readonly expectedUiStateAfterCancel: string;
  readonly expectedDetailStatusAfterCancel: string;
}

export interface MaterialSlotAssignment {
  readonly toolId: number;
  readonly slotId: number;
}

const MODERN_LIFECYCLE_SCENARIOS: readonly LifecycleScenario[] = [
  {
    label: '5M Pro',
    model: 'adventurer-5m-pro',
    printerModel: 'Adventurer 5M Pro',
    modelType: 'adventurer-5m-pro',
    clientType: 'new',
    serial: 'E2E-SN-5MP',
    machineName: 'E2E-5M-Pro',
    checkCode: MODERN_CHECK_CODE,
    supportsLedControls: true,
    supportsFiltration: true,
    expectedUiStateAfterCancel: 'Cancelled',
    expectedDetailStatusAfterCancel: 'cancelled',
  },
  {
    label: '5M',
    model: 'adventurer-5m',
    printerModel: 'Adventurer 5M',
    modelType: 'adventurer-5m',
    clientType: 'new',
    serial: 'E2E-SN-5M',
    machineName: 'E2E-5M',
    checkCode: MODERN_CHECK_CODE,
    supportsLedControls: true,
    supportsFiltration: false,
    expectedUiStateAfterCancel: 'Cancelled',
    expectedDetailStatusAfterCancel: 'cancelled',
  },
  {
    label: 'AD5X',
    model: 'adventurer-5x',
    printerModel: 'AD5X',
    modelType: 'ad5x',
    clientType: 'new',
    serial: 'E2E-SN-AD5X',
    machineName: 'E2E-AD5X',
    checkCode: MODERN_CHECK_CODE,
    supportsLedControls: true,
    supportsFiltration: false,
    expectedUiStateAfterCancel: 'Cancelled',
    expectedDetailStatusAfterCancel: 'cancelled',
  },
];

const LEGACY_LIFECYCLE_SCENARIOS: readonly LifecycleScenario[] = [
  {
    label: 'Adventurer 3',
    model: 'adventurer-3',
    printerModel: 'Adventurer 3',
    modelType: 'generic-legacy',
    clientType: 'legacy',
    serial: 'E2E-SN-A3',
    machineName: 'E2E-A3',
    checkCode: LEGACY_CHECK_CODE,
    supportsLedControls: false,
    supportsFiltration: false,
    expectedUiStateAfterCancel: 'Ready',
    expectedDetailStatusAfterCancel: 'cancelled',
  },
  {
    label: 'Adventurer 4',
    model: 'adventurer-4',
    printerModel: 'Adventurer 4',
    modelType: 'generic-legacy',
    clientType: 'legacy',
    serial: 'E2E-SN-A4',
    machineName: 'E2E-A4',
    checkCode: LEGACY_CHECK_CODE,
    supportsLedControls: false,
    supportsFiltration: false,
    expectedUiStateAfterCancel: 'Ready',
    expectedDetailStatusAfterCancel: 'cancelled',
  },
];

export const ALL_LIFECYCLE_SCENARIOS: readonly LifecycleScenario[] = [
  ...MODERN_LIFECYCLE_SCENARIOS,
  ...LEGACY_LIFECYCLE_SCENARIOS,
];

const resolvedAd5xScenario =
  MODERN_LIFECYCLE_SCENARIOS.find((scenario) => scenario.model === 'adventurer-5x') ?? null;

if (!resolvedAd5xScenario) {
  throw new Error('Missing AD5X lifecycle scenario');
}

export const AD5X_SCENARIO: LifecycleScenario = resolvedAd5xScenario;

export const AD5X_MULTI_COLOR_MAPPINGS: readonly EmulatorMaterialMapping[] = [
  {
    toolId: 0,
    slotId: 1,
    materialName: 'PLA',
    toolMaterialColor: '#4DA3FF',
    slotMaterialColor: '#4DA3FF',
  },
  {
    toolId: 1,
    slotId: 2,
    materialName: 'PETG',
    toolMaterialColor: '#FF8A3D',
    slotMaterialColor: '#FF8A3D',
  },
];

const FIVE_M_SCENARIO =
  MODERN_LIFECYCLE_SCENARIOS.find((scenario) => scenario.model === 'adventurer-5m') ?? null;
const FIVE_M_PRO_SCENARIO =
  MODERN_LIFECYCLE_SCENARIOS.find((scenario) => scenario.model === 'adventurer-5m-pro') ?? null;

if (!FIVE_M_SCENARIO || !FIVE_M_PRO_SCENARIO) {
  throw new Error('Missing 5M and/or 5M Pro lifecycle scenario');
}

export const FORCE_LEGACY_DIRECT_SCENARIOS: readonly LifecycleScenario[] = [
  {
    ...FIVE_M_SCENARIO,
    label: '5M (forced legacy)',
    clientType: 'legacy',
    expectedUiStateAfterCancel: 'Ready',
  },
  {
    ...FIVE_M_PRO_SCENARIO,
    label: '5M Pro (forced legacy)',
    clientType: 'legacy',
    supportsFiltration: false,
    expectedUiStateAfterCancel: 'Ready',
  },
];

export function createForceLegacySeededPrinter(params: {
  scenario: LifecycleScenario;
  ipAddress: string;
  commandPort: number;
  httpPort: number;
}): SeededPrinterDetailsEntry {
  return {
    Name: params.scenario.machineName,
    IPAddress: params.ipAddress,
    SerialNumber: params.scenario.serial,
    CheckCode: params.scenario.checkCode,
    ClientType: 'legacy',
    printerModel: params.scenario.printerModel,
    modelType: params.scenario.modelType,
    customLedsEnabled: true,
    forceLegacyMode: true,
    commandPort: params.commandPort,
    httpPort: params.httpPort,
    webUIEnabled: true,
  };
}
