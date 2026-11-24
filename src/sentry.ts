import * as Sentry from '@sentry/capacitor';
import { init as reactInit } from '@sentry/react';
import { Capacitor } from '@capacitor/core';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';
import { setReporter, type Report } from './report';

/*
 * Crash and error reporting (Sentry, EU region / Frankfurt).
 *
 * Only in release builds of the iOS/Android apps: not in development and not
 * on the website. No personal data: no user, IP, emails or song content.
 */

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
/**
 * `VITE_SENTRY_TEST=1 npm run sync` builds an app that sends one test event
 * at launch (with Sentry debug logs), to check reports arrive. Never ship it.
 */
const testBuild = import.meta.env.VITE_SENTRY_TEST === '1';

/** Drops query strings: Supabase URLs can carry ids and filters. */
function stripQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.split('?')[0] : url;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.server_name;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    event.request.url = stripQuery(event.request.url) as string | undefined;
    delete event.request.query_string;
  }
  return event;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.data && 'url' in crumb.data) {
    crumb.data = { ...crumb.data, url: stripQuery(crumb.data.url) };
  }
  return crumb;
}

/** Sends reports from report.ts to Sentry. */
export function forward({ level, where, error, extra }: Report): void {
  // Sentry's own global handlers already capture these.
  if (where.startsWith('global.')) return;
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    scope.setTag('where', where);
    if (extra) scope.setContext('details', extra);
    // Warnings (late clicks, missing cues) group by where they happen.
    if (level === 'warning') scope.setFingerprint([where]);
    Sentry.captureException(error);
  });
}

export function initSentry(): void {
  if (!dsn || !import.meta.env.PROD || !Capacitor.isNativePlatform()) return;

  Sentry.init(
    {
      dsn,
      sendDefaultPii: false,
      // Errors and crashes only: no performance tracing, no session replay.
      tracesSampleRate: 0,
      debug: testBuild,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    },
    reactInit
  );
  setReporter(forward);
  if (testBuild) Sentry.captureMessage('Segno Cue test event');
}
