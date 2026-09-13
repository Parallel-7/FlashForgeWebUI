/**
 * @fileoverview Unit tests for stored-file estimate capture: the capture
 * rule (single material + printer-reported weight), the approved spool
 * resolution rule (exactly one assigned slot, never guess), skip reasons,
 * the fixed-delay propagation retry (fake timers, including that the wait
 * stays inside the fire-and-forget promise), the empty-list warn signal,
 * and record-shape compatibility with the JobEstimateStore that
 * StationUsageTracker reads from.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FFGcodeToolData } from '@ghosttypes/ff-api';
import { describe, expect, it, jest } from '@jest/globals';
import type {
  AD5XJobInfo,
  BasicJobInfo,
  JobListResult,
} from '../types/printer-backend/backend-operations';
import type { JobEstimateRecord } from '../types/spoolman-tracking';
import { JobEstimateStore } from './JobEstimateStore';
import {
  captureStoredFileEstimate,
  PROPAGATION_RETRY_DELAY_MS,
  planStoredFileCapture,
  type StoredFileEstimateDeps,
} from './stored-file-estimate';

function ad5xJob(overrides: Partial<AD5XJobInfo> = {}): AD5XJobInfo {
  return {
    fileName: 'stored-single.3mf',
    printingTime: 3600,
    _type: 'ad5x',
    toolCount: 1,
    toolDatas: [],
    totalFilamentWeight: 130,
    useMatlStation: false,
    ...overrides,
  };
}

function basicJob(): BasicJobInfo {
  return { fileName: 'stored-single.3mf', printingTime: 3600, _type: 'basic' };
}

function tool(toolId: number, filamentWeight: number): FFGcodeToolData {
  return { toolId, filamentWeight, slotId: 0, materialName: '', materialColor: '#000000' };
}

describe('planStoredFileCapture', () => {
  it('skips when the file is not in the printer list', () => {
    expect(planStoredFileCapture(null, [])).toMatchObject({
      captured: false,
      reason: 'file-not-in-list',
    });
  });

  it('skips printers that only report file names (Creator 5)', () => {
    expect(planStoredFileCapture(basicJob(), [2])).toMatchObject({
      captured: false,
      reason: 'metadata-unavailable',
    });
  });

  it('skips multi-material files declared by toolCount', () => {
    expect(planStoredFileCapture(ad5xJob({ toolCount: 2 }), [2])).toMatchObject({
      captured: false,
      reason: 'multi-material',
    });
  });

  it('skips multi-material files declared by toolDatas length', () => {
    const job = ad5xJob({
      toolCount: 1,
      toolDatas: [tool(0, 60), tool(1, 70)],
    });
    expect(planStoredFileCapture(job, [2])).toMatchObject({
      captured: false,
      reason: 'multi-material',
    });
  });

  it('skips when no usable weight is reported anywhere', () => {
    expect(planStoredFileCapture(ad5xJob({ totalFilamentWeight: 0 }), [2])).toMatchObject({
      captured: false,
      reason: 'no-filament-weight',
    });
  });

  it('skips when weights are negative or not finite', () => {
    expect(planStoredFileCapture(ad5xJob({ totalFilamentWeight: Number.NaN }), [2])).toMatchObject({
      captured: false,
      reason: 'no-filament-weight',
    });
    expect(planStoredFileCapture(ad5xJob({ totalFilamentWeight: -5 }), [2])).toMatchObject({
      captured: false,
      reason: 'no-filament-weight',
    });
  });

  it('falls back to the single tool filamentWeight when total is missing', () => {
    const job = ad5xJob({
      totalFilamentWeight: undefined,
      toolDatas: [tool(3, 40)],
    });
    expect(planStoredFileCapture(job, [2])).toEqual({
      captured: true,
      toolId: 3,
      slotId: 2,
      usedG: 40,
    });
  });

  it('skips when no slot has a spool assigned', () => {
    expect(planStoredFileCapture(ad5xJob(), [])).toMatchObject({
      captured: false,
      reason: 'no-spool-assigned',
    });
  });

  it('skips when multiple slots have spools assigned (never guess)', () => {
    expect(planStoredFileCapture(ad5xJob(), [1, 2])).toMatchObject({
      captured: false,
      reason: 'multiple-spools-assigned',
    });
  });

  it('captures with the only assigned slot and printer-reported weight', () => {
    expect(planStoredFileCapture(ad5xJob(), [2])).toEqual({
      captured: true,
      toolId: 0,
      slotId: 2,
      usedG: 130,
    });
  });
});

interface CapturedCall {
  readonly contextId: string;
  readonly fileName: string;
  readonly tool: { readonly toolId: number; readonly slotId: number; readonly usedG: number };
}

interface Harness {
  readonly captured: CapturedCall[];
  readonly state: {
    spoolmanEnabled: boolean;
    station: boolean;
    existingEstimate: boolean;
    assignedSlotIds: readonly number[];
    jobs: readonly (AD5XJobInfo | BasicJobInfo)[];
    listCalls: number;
    failList: boolean;
  };
  readonly deps: StoredFileEstimateDeps;
}

function harness(): Harness {
  const captured: CapturedCall[] = [];
  const state = {
    spoolmanEnabled: true,
    station: true,
    existingEstimate: false,
    assignedSlotIds: [2] as readonly number[],
    jobs: [ad5xJob()] as readonly (AD5XJobInfo | BasicJobInfo)[],
    listCalls: 0,
    failList: false,
  };

  const deps: StoredFileEstimateDeps = {
    isSpoolmanEnabled: () => state.spoolmanEnabled,
    isStationContext: () => state.station,
    getRecentJobs: async () => {
      state.listCalls += 1;
      if (state.failList) {
        throw new Error('gcodeList unreachable');
      }
      return {
        success: true,
        jobs: state.jobs,
        totalCount: state.jobs.length,
        source: 'recent',
      } as JobListResult;
    },
    hasEstimate: (_storeKey, fileName) =>
      state.existingEstimate && fileName === 'stored-single.3mf',
    assignedSlotIds: () => state.assignedSlotIds,
    resolveStoreKey: (contextId) => `serial-${contextId}`,
    capture: (contextId, fileName, tool) => {
      captured.push({ contextId, fileName, tool });
    },
  };

  return { captured, state, deps };
}

describe('captureStoredFileEstimate', () => {
  it('skips entirely when Spoolman is disabled', async () => {
    const h = harness();
    h.state.spoolmanEnabled = false;
    await expect(captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)).resolves.toBe(
      'spoolman-disabled'
    );
    expect(h.state.listCalls).toBe(0);
    expect(h.captured).toHaveLength(0);
  });

  it('skips non-station contexts without touching the printer', async () => {
    const h = harness();
    h.state.station = false;
    await expect(captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)).resolves.toBe(
      'not-a-station-context'
    );
    expect(h.state.listCalls).toBe(0);
  });

  it('never overwrites an existing estimate record', async () => {
    const h = harness();
    h.state.existingEstimate = true;
    await expect(captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)).resolves.toBe(
      'already-tracked'
    );
    expect(h.state.listCalls).toBe(0);
    expect(h.captured).toHaveLength(0);
  });

  it('reports metadata-unavailable when the file list lookup fails', async () => {
    const h = harness();
    h.state.failList = true;
    await expect(captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)).resolves.toBe(
      'metadata-unavailable'
    );
    expect(h.captured).toHaveLength(0);
  });

  it('retries once after the propagation delay when the file is not listed yet, then captures', async () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      h.state.jobs = [];
      const pending = captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps);

      // First lookup runs immediately and misses.
      await jest.advanceTimersByTimeAsync(0);
      expect(h.state.listCalls).toBe(1);

      // Firmware propagates the file into the recent list during the wait.
      h.state.jobs = [ad5xJob()];
      await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAY_MS - 1);
      expect(h.state.listCalls).toBe(1);

      await jest.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeNull();
      expect(h.state.listCalls).toBe(2);
      expect(h.captured).toEqual([
        {
          contextId: 'ctx-1',
          fileName: 'stored-single.3mf',
          tool: { toolId: 0, slotId: 2, usedG: 130 },
        },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports file-not-in-list when the file stays absent through the propagation retry', async () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      h.state.jobs = [];
      const pending = captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps);
      const assertion = expect(pending).resolves.toBe('file-not-in-list');
      await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAY_MS);
      await assertion;
      expect(h.state.listCalls).toBe(2);
      expect(h.captured).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not retry when the skip reason is anything other than file-not-in-list', async () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      h.state.jobs = [ad5xJob({ toolCount: 2, toolDatas: [tool(0, 60), tool(1, 70)] })];
      const pending = captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps);
      const assertion = expect(pending).resolves.toBe('multi-material');
      await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAY_MS * 2);
      await assertion;
      expect(h.state.listCalls).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the propagation wait inside the returned promise (start response never waits)', async () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      h.state.jobs = [];
      let settled = false;
      const pending = captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps).then(
        (result) => {
          settled = true;
          return result;
        }
      );

      // Microtasks flushed: the first lookup missed and the retry timer is
      // armed. The caller-visible contract is still just this pending
      // promise; nothing on the start-response path awaits the delay.
      await jest.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);

      await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAY_MS);
      await expect(pending).resolves.toBe('file-not-in-list');
      expect(settled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('warns when the whole recent list is empty (fetch failure is indistinguishable)', async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = harness();
      h.state.jobs = [];
      const pending = captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps);
      const assertion = expect(pending).resolves.toBe('file-not-in-list');
      await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAY_MS);
      await assertion;
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Recent file list is empty'));
    } finally {
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('logs a plain skip, not the empty-list warn, when the list is non-empty but lacks the file', async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = harness();
      h.state.jobs = [ad5xJob({ fileName: 'other-file.gcode' })];
      const pending = captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps);
      const assertion = expect(pending).resolves.toBe('file-not-in-list');
      await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAY_MS);
      await assertion;
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('captures a single tool entry with the printer-reported weight', async () => {
    const h = harness();
    await expect(
      captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)
    ).resolves.toBeNull();
    expect(h.captured).toEqual([
      {
        contextId: 'ctx-1',
        fileName: 'stored-single.3mf',
        tool: { toolId: 0, slotId: 2, usedG: 130 },
      },
    ]);
  });

  it('skips multi-material stored files without capturing', async () => {
    const h = harness();
    h.state.jobs = [
      ad5xJob({
        toolCount: 2,
        toolDatas: [tool(0, 60), tool(1, 70)],
      }),
    ];
    await expect(captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)).resolves.toBe(
      'multi-material'
    );
    expect(h.captured).toHaveLength(0);
  });

  it('skips the deduction when no slot has a spool assigned', async () => {
    const h = harness();
    h.state.assignedSlotIds = [];
    await expect(captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)).resolves.toBe(
      'no-spool-assigned'
    );
    expect(h.captured).toHaveLength(0);
  });

  it('skips the deduction when two slots have spools assigned', async () => {
    const h = harness();
    h.state.assignedSlotIds = [1, 2];
    await expect(captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps)).resolves.toBe(
      'multiple-spools-assigned'
    );
    expect(h.captured).toHaveLength(0);
  });

  it('writes records StationUsageTracker can consume (store round-trip)', async () => {
    const h = harness();
    await captureStoredFileEstimate('ctx-1', 'stored-single.3mf', h.deps);
    const call = h.captured[0];
    expect(call).toBeDefined();

    // Same record shape captureStationEstimate persists for this capture.
    const record: JobEstimateRecord = {
      fileName: call.fileName,
      mappings: [{ toolId: call.tool.toolId, slotId: call.tool.slotId }],
      perTool: [
        { toolId: call.tool.toolId, slotId: call.tool.slotId, usedG: call.tool.usedG, usedM: null },
      ],
      capturedAt: new Date().toISOString(),
      source: 'printer-metadata',
    };

    const storePath = path.join(
      os.tmpdir(),
      `stored-file-estimate-test-${process.pid}-${Date.now()}.json`
    );
    const store = new JobEstimateStore(storePath);
    try {
      store.captureEstimate('serial-ctx-1', record);
      expect(store.findEstimate('serial-ctx-1', 'stored-single.3mf')).toEqual(record);
    } finally {
      fs.rmSync(storePath, { force: true });
    }
  });
});
