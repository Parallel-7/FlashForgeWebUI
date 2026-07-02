/**
 * @fileoverview Backend implementation for Creator 5 / Creator 5 Pro printers.
 *
 * The Creator 5 series is a material-station printer like the AD5X, but differs in
 * several wire-level ways, so it extends {@link AD5XBackend} and overrides only the
 * Creator 5 specifics:
 *
 * - **HTTP-only**: no legacy TCP server (port 8899). The FiveMClient runs in
 *   `httpOnly` mode and is the entire connection; there is no secondary client and
 *   no raw G-code / M-code passthrough.
 * - **Two-step material workflow**: unlike the AD5X (which maps materials at upload
 *   time), the Creator 5 uploads the file with `useMatlStation` / `gcodeToolCnt`
 *   flags and then maps per-tool materials at print-start via `POST /printGcode`.
 * - **Per-tool temperatures**: a 4-nozzle tool changer plus a heated chamber.
 * - **Camera** on both Creator 5 and Creator 5 Pro; **filtration / door sensor** on
 *   the Pro only (though its filtration controls are not exposed — only a TVOC read).
 *
 * Key exports:
 * - Creator5Backend class: Backend for Creator 5 / Creator 5 Pro printers
 */

import { type Creator5MaterialMapping, FiveMClient, type FFMachineInfo } from '@ghosttypes/ff-api';
import * as path from 'path';
import type {
  JobOperationParams,
  JobStartResult,
  MaterialStationStatus,
  PrinterFeatureSet,
} from '../types/printer-backend';
import { AD5XBackend } from './AD5XBackend';

/**
 * Backend implementation for the Creator 5 / Creator 5 Pro. Extends the AD5X
 * material-station backend, overriding the Creator 5's HTTP-only transport, its
 * two-step material-mapping print flow, per-tool temperatures, and Pro hardware.
 */
export class Creator5Backend extends AD5XBackend {
  /**
   * HTTP-only client initialization. The Creator 5 has no TCP channel, so we
   * validate only the primary FiveMClient and leave the legacy client unset (the
   * base {@link DualAPIBackend.initializeClients} would require a secondary client).
   */
  protected initializeClients(): void {
    if (!(this.primaryClient instanceof FiveMClient)) {
      throw new Error('Creator5Backend requires FiveMClient as primary client');
    }
    this.fiveMClient = this.primaryClient;
    // No secondaryClient / legacyClient: the Creator 5 series is HTTP-only.
  }

  /** Whether this specific printer is a Creator 5 Pro (vs a plain Creator 5). */
  private isCreator5Pro(): boolean {
    return this.modelType === 'creator-5-pro';
  }

  /**
   * Creator 5 base features: the AD5X material-station set, but HTTP-only — no raw
   * G-code passthrough and no legacy status path. The Creator 5 Pro ships with
   * filtration hardware, but its filtration controls are not exposed (only a
   * read-only TVOC value), so filtration stays non-controllable here.
   */
  protected getChildBaseFeatures(): PrinterFeatureSet {
    const features = super.getChildBaseFeatures();

    return {
      ...features,
      camera: {
        ...features.camera,
      },
      ledControl: {
        ...features.ledControl,
        // Creator 5 has a built-in LED; no legacy TCP path.
        builtin: true,
        usesLegacyAPI: false,
      },
      filtration: {
        available: false,
        controllable: false,
        reason: 'Filtration control is not available on the Creator 5 series',
      },
      // The Creator 5 series is HTTP-only and exposes NO raw G-code / M-code
      // passthrough: the firmware's only command surface is the HTTP /control set.
      gcodeCommands: {
        available: false,
        usesLegacyAPI: false,
        supportedCommands: [],
      },
      statusMonitoring: {
        ...features.statusMonitoring,
        usesNewAPI: true,
        usesLegacyAPI: false,
      },
      jobManagement: {
        ...features.jobManagement,
        usesNewAPI: true,
      },
    };
  }

  /**
   * Surface Creator 5-specific status fields (per-tool temps, chamber, air quality,
   * door capability) on top of the AD5X status.
   */
  protected getAdditionalStatusFields(machineInfo: unknown): Record<string, unknown> {
    const base = super.getAdditionalStatusFields(machineInfo);
    const info = machineInfo as Partial<FFMachineInfo> | null;

    return {
      ...base,
      // Per-tool current/target temperatures (4 entries on the Creator 5 series).
      toolTemps: info?.ToolTemps ?? [],
      // Chamber temperature (both Creator 5 and 5 Pro have a heated chamber).
      chamberTemp: info?.Chamber?.current ?? 0,
      chamberTargetTemp: info?.Chamber?.set ?? 0,
      // Air-quality reading (Creator 5 Pro).
      tvoc: info?.Tvoc ?? 0,
      // Capability flags for the renderer to gate UI.
      isCreator5Pro: this.isCreator5Pro(),
      hasChamberControl: true, // Creator 5 / 5 Pro always have a heated chamber
      hasDoorSensor: info?.HasDoorSensor ?? this.isCreator5Pro(),
    };
  }

  /**
   * Material-station status, tagged with the printer model so the renderer picks
   * the Creator 5 palette (rather than the default AD5X palette).
   */
  public getMaterialStationStatus(): MaterialStationStatus | null {
    const status = super.getMaterialStationStatus();
    return status ? { ...status, printerModelType: this.modelType } : null;
  }

  /**
   * Start a job on the Creator 5 / Creator 5 Pro.
   *
   * A fresh file upload goes through the two-step material flow
   * ({@link uploadCreator5File}); an already-resident file goes straight to the
   * native print-start command (`POST /printGcode`) with the per-tool mappings.
   */
  public async startJob(params: JobOperationParams): Promise<JobStartResult> {
    try {
      const materialMappings = params.additionalParams?.materialMappings as
        | Creator5MaterialMapping[]
        | undefined;

      // Fresh file upload: upload (with the material-station flags), then start.
      if (params.filePath) {
        return await this.uploadCreator5File(
          params.filePath,
          params.startNow,
          params.leveling,
          materialMappings,
          params.fileName
        );
      }

      if (!params.fileName) {
        throw new Error('fileName or filePath is required');
      }

      // Upload-only request (start handled separately by the caller).
      if (!params.startNow) {
        return {
          success: true,
          fileName: params.fileName,
          started: false,
          timestamp: new Date(),
        };
      }

      const started = await this.startCreator5Print(params.fileName, params.leveling, materialMappings);
      if (!started) {
        throw new Error('Failed to start Creator 5 job');
      }

      return {
        success: true,
        fileName: params.fileName,
        started: true,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        fileName: params.fileName || '',
        started: false,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Material-station file upload for the Creator 5. Overrides the AD5X method name
   * but runs the Creator 5 two-step flow. Material matching is always used on the
   * Creator 5, so `useMatlStation` is always true here.
   */
  public async uploadFileAD5X(
    filePath: string,
    startPrint: boolean,
    levelingBeforePrint: boolean,
    materialMappings?: Creator5MaterialMapping[]
  ): Promise<JobStartResult> {
    return this.uploadCreator5File(filePath, startPrint, levelingBeforePrint, materialMappings);
  }

  /**
   * The Creator 5 two-step upload: upload the file (never auto-start via `printNow`,
   * since the material mapping is applied by the follow-up `/printGcode`), then —
   * when requested — start the print with the mappings.
   */
  private async uploadCreator5File(
    filePath: string,
    startPrint: boolean,
    levelingBeforePrint: boolean,
    materialMappings?: Creator5MaterialMapping[],
    fileNameOverride?: string
  ): Promise<JobStartResult> {
    const fileName = fileNameOverride || path.basename(filePath);
    const toolCount = materialMappings && materialMappings.length > 0 ? materialMappings.length : 1;

    try {
      const uploaded = await this.fiveMClient.jobControl.uploadFileCreator5({
        filePath,
        startPrint: false,
        levelingBeforePrint,
        useMatlStation: true,
        gcodeToolCnt: toolCount,
      });
      if (!uploaded) {
        throw new Error('Failed to upload job to Creator 5');
      }

      if (startPrint) {
        const started = await this.startCreator5Print(fileName, levelingBeforePrint, materialMappings);
        if (!started) {
          throw new Error('Failed to start Creator 5 job after upload');
        }
      }

      return {
        success: true,
        fileName,
        started: startPrint,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        fileName,
        started: false,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Issue the Creator 5 native print-start (`POST /printGcode`) for a file already
   * on the printer, with optional per-tool material mappings.
   */
  private async startCreator5Print(
    fileName: string,
    levelingBeforePrint: boolean,
    materialMappings?: Creator5MaterialMapping[]
  ): Promise<boolean> {
    return await this.fiveMClient.jobControl.startCreator5Job({
      fileName,
      levelingBeforePrint,
      materialMappings: materialMappings && materialMappings.length > 0 ? materialMappings : undefined,
    });
  }
}
