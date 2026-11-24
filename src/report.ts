/**
 * One place for every error and warning the app wants to know about.
 *
 * Today it writes to the console; an error-tracking service (Sentry) plugs in
 * via setReporter() without touching the call sites.
 *
 * Privacy: never pass song names, emails, user ids or other personal data in
 * `where`, the message or `extra`. Counts, tempos, meters, platform and error
 * codes are fine.
 */

export type Level = 'error' | 'warning';
export type Extra = Record<string, string | number | boolean | undefined>;

export interface Report {
  level: Level;
  /** Stable code for where it happened, e.g. "player.start". Used for grouping. */
  where: string;
  error: Error;
  extra?: Extra;
}

export type Reporter = (report: Report) => void;

let reporter: Reporter | null = null;

/** Route reports to a service (e.g. Sentry). Pass null to detach. */
export function setReporter(r: Reporter | null): void {
  reporter = r;
}

// The same problem repeating (a sync retry loop, a late click every bar) must
// not flood the console or use up the error quota.
const MAX_PER_KEY = 3;
const counts = new Map<string, number>();

/** For tests. */
export function resetReportLimits(): void {
  counts.clear();
}

/**
 * Turns anything thrown (Error, Supabase error object, string) into an Error
 * with a useful message. Supabase errors keep only code + message: their
 * `details` can contain row data (song names), so it is dropped.
 */
export function toError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  if (thrown && typeof thrown === 'object') {
    const { message, code } = thrown as { message?: unknown; code?: unknown };
    const text = typeof message === 'string' && message ? message : 'Unknown error';
    const err = new Error(typeof code === 'string' && code ? `[${code}] ${text}` : text);
    return err;
  }
  return new Error(typeof thrown === 'string' ? thrown : String(thrown));
}

function send(level: Level, where: string, error: Error, extra?: Extra): void {
  const key = `${level}:${where}:${error.message}`;
  const n = (counts.get(key) ?? 0) + 1;
  counts.set(key, n);
  if (n > MAX_PER_KEY) return;

  const log = level === 'error' ? console.error : console.warn;
  log(`[${where}]`, error, extra ?? '');
  try {
    reporter?.({ level, where, error, extra });
  } catch {
    // Reporting must never break the app.
  }
}

export function reportError(thrown: unknown, where: string, extra?: Extra): void {
  send('error', where, toError(thrown), extra);
}

export function reportWarning(message: string, where: string, extra?: Extra): void {
  send('warning', where, new Error(message), extra);
}

/** Failures that just mean "no connection right now": not worth reporting. */
export function isNetworkError(thrown: unknown): boolean {
  const msg = toError(thrown).message;
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(
    msg
  );
}

/** Catch errors nothing else handled (event handlers, stray promises). */
export function installGlobalHandlers(target: Window = window): void {
  target.addEventListener('error', (e) => {
    reportError(e.error ?? e.message, 'global.error');
  });
  target.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason, 'global.unhandledrejection');
  });
}
