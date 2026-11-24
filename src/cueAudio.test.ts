import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Report } from './report';

/** Loads fresh modules (the cue cache is module state). */
async function load() {
  vi.resetModules();
  const reports: Report[] = [];
  (await import('./report')).setReporter((r) => reports.push(r));
  return { cue: await import('./cueAudio'), reports };
}

const ctx = {
  decodeAudioData: async (buf: ArrayBuffer) => ({ decoded: buf.byteLength }),
} as unknown as AudioContext;

function serve(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status, arrayBuffer: async () => new ArrayBuffer(8) }))
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loading cue recordings', () => {
  it('loads on iOS, where Capacitor answers media files with status 0', async () => {
    serve(0);
    const { cue, reports } = await load();
    expect(await cue.loadCueBuffer(ctx, 'verse')).toEqual({ decoded: 8 });
    expect(cue.getCueBuffer('verse')).not.toBeNull();
    expect(reports).toEqual([]);
  });

  it('loads with a normal 200', async () => {
    serve(200);
    const { cue } = await load();
    expect(await cue.loadCueBuffer(ctx, 'verse')).not.toBeNull();
  });

  it('a missing file is reported and retried next time', async () => {
    serve(404);
    const { cue, reports } = await load();
    expect(await cue.loadCueBuffer(ctx, 'verse')).toBeNull();
    expect(reports.map((r) => [r.where, r.extra])).toEqual([
      ['audio.cue-load', { word: 'verse' }],
    ]);

    serve(200);
    expect(await cue.loadCueBuffer(ctx, 'verse')).not.toBeNull();
  });
});
