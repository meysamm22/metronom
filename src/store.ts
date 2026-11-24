import type { Song, Section } from './types';
import { supabase, isSupabaseConfigured } from './supabase';
import { isNetworkError, reportError } from './report';

/**
 * Local-first song store.
 *
 * The device (localStorage) is the source of truth so the app works with no
 * network — critical for practice rooms and live shows. Supabase is a
 * background sync target: changes made offline are queued and pushed when a
 * connection and session are available.
 */

const SONGS_KEY = 'metronom.songs.v1';
const PENDING_KEY = 'metronom.pending.v1';
/**
 * User's manual song order (list of ids). Kept apart from the song list
 * because remote sync replaces that list wholesale. Synced to the
 * songs.position column when signed in.
 */
const ORDER_KEY = 'metronom.order.v1';

type PendingOp =
  | { type: 'upsert'; song: Song }
  | { type: 'delete'; id: string }
  // The order to push is read at push time, so one queued op covers any
  // number of reorders. `at` makes each reorder a distinct op (see sync).
  | { type: 'order'; at: number };

/** Ops with the same key replace each other in the queue. */
function opKey(op: PendingOp): string {
  if (op.type === 'order') return '__order__';
  return op.type === 'upsert' ? op.song.id : op.id;
}

const sameOp = (a: PendingOp, b: PendingOp) =>
  JSON.stringify(a) === JSON.stringify(b);

interface SongRow {
  id: string;
  user_id: string;
  name: string;
  bpm: number;
  time_signature: string;
  sections: Section[];
  position?: number | null;
  created_at: string;
  updated_at: string;
}

function rowToSong(row: SongRow): Song {
  return {
    id: row.id,
    name: row.name,
    bpm: row.bpm,
    timeSignature: row.time_signature as Song['timeSignature'],
    sections: row.sections,
  };
}

// ---------- Local storage ----------

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    // Corrupt or unreadable storage: the user's songs would seem to vanish.
    reportError(e, 'store.read', { key });
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Usually storage full: the change is not saved on the device.
    reportError(e, 'store.write', { key });
  }
}

export function loadLocalSongs(): Song[] {
  return readJson<Song[]>(SONGS_KEY, []);
}

function saveLocalSongs(songs: Song[]): void {
  writeJson(SONGS_KEY, songs);
}

function getPending(): PendingOp[] {
  return readJson<PendingOp[]>(PENDING_KEY, []);
}

function setPending(ops: PendingOp[]): void {
  writeJson(PENDING_KEY, ops);
}

/** Queue an op, replacing any earlier op with the same key. */
function enqueue(op: PendingOp): void {
  const key = opKey(op);
  setPending([...getPending().filter((p) => opKey(p) !== key), op]);
}

export function clearLocalData(): void {
  localStorage.removeItem(SONGS_KEY);
  localStorage.removeItem(PENDING_KEY);
  localStorage.removeItem(ORDER_KEY);
}

/** Songs in the user's order; ones not yet placed keep their order at the end. */
function applyOrder(songs: Song[]): Song[] {
  const order = readJson<string[]>(ORDER_KEY, []);
  const rank = new Map(order.map((id, i) => [id, i]));
  return songs
    .map((song, i) => ({ song, key: rank.get(song.id) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.song);
}

export function saveSongOrder(ids: string[]): void {
  writeJson(ORDER_KEY, ids);
  enqueue({ type: 'order', at: Date.now() });
  void syncWithRemote();
}

// ---------- Public API (local-first) ----------

export function loadSongs(): Song[] {
  return applyOrder(loadLocalSongs());
}

export function saveSong(song: Song): void {
  const songs = loadLocalSongs();
  const idx = songs.findIndex((s) => s.id === song.id);
  if (idx >= 0) songs[idx] = song;
  else songs.push(song);
  saveLocalSongs(songs);
  enqueue({ type: 'upsert', song });
  void syncWithRemote();
}

export function deleteSong(id: string): void {
  saveLocalSongs(loadLocalSongs().filter((s) => s.id !== id));
  enqueue({ type: 'delete', id });
  void syncWithRemote();
}

// ---------- Remote sync ----------

let syncing = false;
/** A sync was requested while one was running; run once more after it. */
let rerun = false;

/**
 * Push queued offline changes to Supabase, then pull the remote list into the
 * local store. Returns the fresh song list, or null when sync was not
 * possible (offline, not configured, not signed in, or already running).
 */
export async function syncWithRemote(): Promise<Song[] | null> {
  if (!isSupabaseConfigured) return null;
  if (syncing) {
    rerun = true;
    return null;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  syncing = true;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Push queued local changes first so they win over stale remote rows.
    for (const op of getPending()) {
      let done = true;
      if (op.type === 'upsert') {
        const { error } = await supabase.from('songs').upsert({
          id: op.song.id,
          user_id: user.id,
          name: op.song.name,
          bpm: op.song.bpm,
          time_signature: op.song.timeSignature,
          sections: op.song.sections,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      } else if (op.type === 'delete') {
        const { error } = await supabase.from('songs').delete().eq('id', op.id);
        if (error) throw error;
      } else {
        const ids = applyOrder(loadLocalSongs()).map((s) => s.id);
        const { error } = await supabase.rpc('set_song_order', {
          song_ids: ids,
        });
        if (error?.code === 'PGRST202') {
          // Database not migrated yet: keep the op for later, and don't let
          // it block syncing songs.
          done = false;
        } else if (error) {
          throw error;
        }
      }
      // Drop each op as it lands so a mid-sync failure retries only the
      // rest. Re-read the queue: if the same song was edited (or the list
      // reordered) while this request was in flight, the newer op replaced
      // this one and must stay.
      if (done) setPending(getPending().filter((p) => !sameOp(p, op)));
    }

    let positionSynced = true;
    let { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (error?.code === '42703') {
      // No position column yet (database not migrated).
      positionSynced = false;
      ({ data, error } = await supabase
        .from('songs')
        .select('*')
        .order('created_at', { ascending: true }));
    }
    if (error) throw error;

    const rows = (data ?? []) as SongRow[];
    // Adopt the server's order unless a local reorder is still waiting to be
    // pushed, or nobody has ever ordered the list there.
    const orderPending = getPending().some((p) => p.type === 'order');
    if (
      positionSynced &&
      !orderPending &&
      rows.some((r) => r.position !== null && r.position !== undefined)
    ) {
      writeJson(
        ORDER_KEY,
        rows.map((r) => r.id)
      );
    }

    const songs = rows.map(rowToSong);
    saveLocalSongs(songs);
    return applyOrder(songs);
  } catch (e) {
    // Queued changes stay queued and are retried on the next sync.
    if (isNetworkError(e)) console.warn('Sync paused: no connection');
    else reportError(e, 'store.sync');
    return null;
  } finally {
    syncing = false;
    if (rerun) {
      rerun = false;
      setTimeout(() => void syncWithRemote(), 0);
    }
  }
}
