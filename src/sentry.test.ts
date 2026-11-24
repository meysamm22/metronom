import { describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/react';

const captured = vi.hoisted(() => [] as { error: unknown; scope: Record<string, unknown> }[]);

vi.mock('@sentry/capacitor', () => ({
  init: () => {},
  withScope: (fn: (scope: object) => void) => {
    const scope: Record<string, unknown> = {};
    fn({
      setLevel: (v: unknown) => (scope.level = v),
      setTag: (k: string, v: unknown) => (scope[`tag:${k}`] = v),
      setContext: (k: string, v: unknown) => (scope[`ctx:${k}`] = v),
      setFingerprint: (v: unknown) => (scope.fingerprint = v),
    });
    captured.at(-1)!.scope = scope;
  },
  captureException: (error: unknown) => captured.push({ error, scope: {} }),
}));

const { forward, scrubBreadcrumb, scrubEvent } = await import('./sentry');

describe('what leaves the phone', () => {
  it('events carry no user, IP, cookies, headers or query strings', () => {
    const event = scrubEvent({
      type: undefined,
      user: { email: 'me@example.com', ip_address: '1.2.3.4' },
      server_name: 'my-iphone',
      request: {
        url: 'capacitor://localhost/rest/v1/songs?id=eq.abc',
        query_string: 'id=eq.abc',
        cookies: { a: 'b' },
        headers: { Authorization: 'Bearer x' },
        data: { name: 'My Song' },
      },
    } as ErrorEvent);
    expect(event.user).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.request).toEqual({ url: 'capacitor://localhost/rest/v1/songs' });
  });

  it('breadcrumb URLs lose their query strings', () => {
    const crumb = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://x.supabase.co/rest/v1/songs?select=*&id=eq.1', status_code: 200 },
    });
    expect(crumb?.data).toEqual({ url: 'https://x.supabase.co/rest/v1/songs', status_code: 200 });
  });
});

describe('forwarding app reports', () => {
  it('sends level, place and details; warnings group by place', () => {
    const error = new Error('Clicks played late');
    forward({ level: 'warning', where: 'audio.late', error, extra: { count: 2 } });
    expect(captured.at(-1)).toEqual({
      error,
      scope: {
        level: 'warning',
        'tag:where': 'audio.late',
        'ctx:details': { count: 2 },
        fingerprint: ['audio.late'],
      },
    });
  });

  it('skips errors Sentry already catches itself', () => {
    const before = captured.length;
    forward({ level: 'error', where: 'global.error', error: new Error('x') });
    expect(captured).toHaveLength(before);
  });
});
