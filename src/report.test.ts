import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installGlobalHandlers,
  isNetworkError,
  reportError,
  reportWarning,
  resetReportLimits,
  setReporter,
  toError,
  type Report,
} from './report';

let reports: Report[];

beforeEach(() => {
  reports = [];
  resetReportLimits();
  setReporter((r) => reports.push(r));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('toError', () => {
  it('keeps real errors as they are', () => {
    const e = new TypeError('boom');
    expect(toError(e)).toBe(e);
  });

  it('keeps a Supabase error’s code and message but drops its details (row data)', () => {
    const err = toError({
      code: '23514',
      message: 'new row violates check constraint',
      details: 'Failing row contains (My Private Song, ...)',
    });
    expect(err.message).toBe('[23514] new row violates check constraint');
    expect(JSON.stringify(err) + err.message + err.stack).not.toContain('Private');
  });

  it('handles strings and odd values', () => {
    expect(toError('plain').message).toBe('plain');
    expect(toError(undefined).message).toBe('undefined');
    expect(toError({}).message).toBe('Unknown error');
  });
});

describe('reporting', () => {
  it('passes level, place and extra data to the reporter', () => {
    reportError(new Error('x'), 'player.start', { bpm: 120 });
    reportWarning('late', 'audio.late', { count: 2 });
    expect(reports.map((r) => [r.level, r.where, r.error.message, r.extra])).toEqual([
      ['error', 'player.start', 'x', { bpm: 120 }],
      ['warning', 'audio.late', 'late', { count: 2 }],
    ]);
  });

  it('sends the same problem at most 3 times', () => {
    for (let i = 0; i < 10; i++) reportError(new Error('same'), 'store.sync');
    reportError(new Error('different'), 'store.sync');
    expect(reports.map((r) => r.error.message)).toEqual([
      'same',
      'same',
      'same',
      'different',
    ]);
  });

  it('a broken reporter never breaks the app', () => {
    setReporter(() => {
      throw new Error('reporter down');
    });
    expect(() => reportError(new Error('x'), 'test')).not.toThrow();
  });

  it('catches errors and promise rejections nothing else handled', () => {
    const target = new EventTarget();
    installGlobalHandlers(target as unknown as Window);
    target.dispatchEvent(Object.assign(new Event('error'), { error: new Error('click handler') }));
    target.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new Error('lost promise') })
    );
    expect(reports.map((r) => [r.where, r.error.message])).toEqual([
      ['global.error', 'click handler'],
      ['global.unhandledrejection', 'lost promise'],
    ]);
  });
});

describe('isNetworkError', () => {
  it.each([
    new TypeError('Failed to fetch'),
    new TypeError('Load failed'),
    { message: 'TypeError: NetworkError when attempting to fetch resource.' },
    new Error('fetch failed'),
  ])('%s is just "offline"', (e) => {
    expect(isNetworkError(e)).toBe(true);
  });

  it('server errors are real errors', () => {
    expect(isNetworkError({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});
