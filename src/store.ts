import type { Song, Section } from './types';
import { supabase, isSupabaseConfigured } from './supabase';

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

type PendingOp =
  | { type: 'upsert'; song: Song }
  | { type: 'delete'; id: string };

interface SongRow {
  id: string;
  user_id: string;
  name: string;
  bpm: number;
  time_signature: string;
  sections: Section[];
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
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to write local store:', e);
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

/** Queue an op, replacing any earlier op for the same song id. */
function enqueue(op: PendingOp): void {
  const id = op.type === 'upsert' ? op.song.id : op.id;
  const rest = getPending().filter(
    (p) => (p.type === 'upsert' ? p.song.id : p.id) !== id
  );
  setPending([...rest, op]);
}

export function clearLocalData(): void {
  localStorage.removeItem(SONGS_KEY);
  localStorage.removeItem(PENDING_KEY);
}

// ---------- Public API (local-first) ----------

export function loadSongs(): Song[] {
  return loadLocalSongs();
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

/**
 * Push queued offline changes to Supabase, then pull the remote list into the
 * local store. Returns the fresh song list, or null when sync was not
 * possible (offline, not configured, not signed in, or already running).
 */
export async function syncWithRemote(): Promise<Song[] | null> {
  if (!isSupabaseConfigured || syncing) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  syncing = true;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Push queued local changes first so they win over stale remote rows.
    const pending = getPending();
    for (let i = 0; i < pending.length; i++) {
      const op = pending[i];
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
      } else {
        const { error } = await supabase.from('songs').delete().eq('id', op.id);
        if (error) throw error;
      }
      // Drop each op as it lands so a mid-sync failure retries only the rest.
      setPending(pending.slice(i + 1));
    }

    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const songs = (data as SongRow[]).map(rowToSong);
    saveLocalSongs(songs);
    return songs;
  } catch (e) {
    console.warn('Sync with Supabase failed (will retry later):', e);
    return null;
  } finally {
    syncing = false;
  }
}
