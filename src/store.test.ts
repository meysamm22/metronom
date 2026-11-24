import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from './types';
import type { Report } from './report';

/*
 * Local-first store against an in-memory fake of the Supabase songs table.
 * Each test gets a fresh store module (its sync flags are module state) and
 * a fresh "device" (localStorage).
 */

interface Row {
  id: string;
  user_id: string;
  name: string;
  bpm: number;
  time_signature: string;
  sections: unknown[];
  position: number | null;
  created_at: number;
}
type Result = { error: { code: string } | null };

const fake = vi.hoisted(() => {
  const state = {
    rows: new Map<string, Row>(),
    user: { id: 'user-1' } as { id: string } | null,
    /** Has the song-order migration been applied? */
    migrated: true,
    failUpsertFor: null as string | null,
    rpcError: null as { code: string } | null,
    /** While set, uploads wait on it (to test edits made mid-sync). */
    hold: null as Promise<void> | null,
    clock: 0,
    log: [] as string[],
    /** Phone says online but requests fail (e.g. captive Wi-Fi). */
    networkDown: false,
  };

  const byPosition = (a: Row, b: Row) =>
    (a.position ?? Infinity) - (b.position ?? Infinity) || a.created_at - b.created_at;

  const client = {
    auth: {
      getUser: async () => {
        if (state.networkDown) throw new TypeError('Failed to fetch');
        state.log.push('getUser');
        return { data: { user: state.user } };
      },
    },
    from: () => ({
      upsert: async (row: Omit<Row, 'position' | 'created_at'>): Promise<Result> => {
        if (state.hold) await state.hold;
        if (state.failUpsertFor === row.id) return { error: { code: '500' } };
        // Like Postgres ON CONFLICT DO UPDATE: unsent columns keep their value.
        const prev = state.rows.get(row.id);
        state.rows.set(row.id, {
          position: null,
          created_at: ++state.clock,
          ...prev,
          ...row,
        });
        state.log.push(`upsert ${row.id}`);
        return { error: null };
      },
      delete: () => ({
        eq: async (_col: string, id: string): Promise<Result> => {
          state.rows.delete(id);
          state.log.push(`delete ${id}`);
          return { error: null };
        },
      }),
      select: () => {
        const orderBy: string[] = [];
        const query = {
          order(col: string) {
            orderBy.push(col);
            return query;
          },
          then<T>(resolve: (r: { data: unknown; error: { code: string } | null }) => T) {
            if (!state.migrated && orderBy.includes('position')) {
              return Promise.resolve({ data: null, error: { code: '42703' } }).then(resolve);
            }
            const rows = [...state.rows.values()]
              .sort(state.migrated ? byPosition : (a, b) => a.created_at - b.created_at)
              .map((r) => {
                const copy: Partial<Row> = { ...r };
                // An unmigrated table has no position column.
                if (!state.migrated) delete copy.position;
                return copy;
              });
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          },
        };
        return query;
      },
    }),
    rpc: async (_fn: string, { song_ids }: { song_ids: string[] }): Promise<Result> => {
      if (!state.migrated) return { error: { code: 'PGRST202' } };
      if (state.rpcError) return { error: state.rpcError };
      song_ids.forEach((id, i) => {
        const row = state.rows.get(id);
        if (row) row.position = i;
      });
      state.log.push(`order ${song_ids.join(',')}`);
      return { error: null };
    },
  };
  return { state, client };
});

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: fake.client,
}));

const server = fake.state;

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const net = { onLine: true };
let storage: MemoryStorage;

/** A fresh phone: empty storage, freshly loaded store module. */
async function newDevice() {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  return import('./store');
}

const song = (id: string, name = `Song ${id}`): Song => ({
  id,
  name,
  bpm: 120,
  timeSignature: '4/4',
  sections: [{ name: 'Verse', bars: 4 }],
});

const ids = (songs: Song[] | null) => songs?.map((s) => s.id);
const pending = () =>
  JSON.parse(storage.getItem('metronom.pending.v1') ?? '[]') as {
    type: string;
    id?: string;
    song?: Song;
  }[];
const serverOrder = () =>
  [...server.rows.values()]
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    .map((r) => r.id);

/** Let fire-and-forget syncs (and their re-runs) finish. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

beforeEach(() => {
  server.rows.clear();
  server.user = { id: 'user-1' };
  server.migrated = true;
  server.failUpsertFor = null;
  server.rpcError = null;
  server.hold = null;
  server.clock = 0;
  server.log = [];
  server.networkDown = false;
  net.onLine = true;
  vi.stubGlobal('navigator', net);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('offline and signed out', () => {
  it('offline: songs save on the device and wait in the queue', async () => {
    net.onLine = false;
    const store = await newDevice();
    store.saveSong(song('a'));
    store.saveSong(song('b'));
    await settle();

    expect(ids(store.loadSongs())).toEqual(['a', 'b']);
    expect(pending().map((p) => p.type)).toEqual(['upsert', 'upsert']);
    expect(server.rows.size).toBe(0);
    expect(await store.syncWithRemote()).toBeNull();
  });

  it('signed out: nothing is sent', async () => {
    server.user = null;
    const store = await newDevice();
    store.saveSong(song('a'));
    await settle();

    expect(server.rows.size).toBe(0);
    expect(pending()).toHaveLength(1);
    expect(ids(store.loadSongs())).toEqual(['a']);
  });

  it('repeated offline edits collapse into one upload per song', async () => {
    net.onLine = false;
    const store = await newDevice();
    store.saveSong(song('a', 'first'));
    store.saveSong(song('a', 'second'));
    store.saveSong(song('b'));
    store.deleteSong('b');
    expect(pending()).toEqual([
      { type: 'upsert', song: song('a', 'second') },
      { type: 'delete', id: 'b' },
    ]);

    net.onLine = true;
    expect(ids(await store.syncWithRemote())).toEqual(['a']);
    expect(server.log.filter((l) => l !== 'getUser')).toEqual(['upsert a', 'delete b']);
    expect(server.rows.get('a')?.name).toBe('second');
    expect(pending()).toEqual([]);
  });
});

describe('signed in', () => {
  it('a saved song reaches the server and the queue empties', async () => {
    const store = await newDevice();
    store.saveSong(song('a'));
    await settle();

    expect([...server.rows.keys()]).toEqual(['a']);
    expect(server.rows.get('a')?.user_id).toBe('user-1');
    expect(pending()).toEqual([]);
  });

  it('a deleted song is deleted on the server', async () => {
    const store = await newDevice();
    store.saveSong(song('a'));
    store.saveSong(song('b'));
    await settle();
    store.deleteSong('a');
    await settle();

    expect([...server.rows.keys()]).toEqual(['b']);
    expect(ids(store.loadSongs())).toEqual(['b']);
  });

  it('a failed upload keeps the rest of the queue for next time', async () => {
    net.onLine = false;
    const store = await newDevice();
    store.saveSong(song('a'));
    store.saveSong(song('b'));
    store.saveSong(song('c'));

    net.onLine = true;
    server.failUpsertFor = 'b';
    expect(await store.syncWithRemote()).toBeNull();
    expect([...server.rows.keys()]).toEqual(['a']);
    expect(pending().map((p) => p.song?.id)).toEqual(['b', 'c']);
    // Local songs are untouched by the failure.
    expect(ids(store.loadSongs())).toEqual(['a', 'b', 'c']);

    server.failUpsertFor = null;
    expect(ids(await store.syncWithRemote())).toEqual(['a', 'b', 'c']);
    expect(pending()).toEqual([]);
  });

  it('an edit made while its previous version is uploading is not lost', async () => {
    const store = await newDevice();
    const gate = deferred();
    server.hold = gate.promise;
    store.saveSong(song('a', 'v1')); // sync starts, upload waits
    await settle();
    store.saveSong(song('a', 'v2')); // edited mid-upload

    server.hold = null;
    gate.release();
    await settle();

    expect(server.rows.get('a')?.name).toBe('v2');
    expect(store.loadSongs()[0].name).toBe('v2');
    expect(pending()).toEqual([]);
  });

  it('a sync requested mid-sync runs once more afterwards, not in parallel', async () => {
    const store = await newDevice();
    const gate = deferred();
    server.hold = gate.promise;
    store.saveSong(song('a'));
    await settle();
    expect(await store.syncWithRemote()).toBeNull(); // busy

    server.hold = null;
    gate.release();
    await settle();
    expect(server.log.filter((l) => l === 'getUser')).toHaveLength(2);
  });

  it('a song added on another device appears after sync', async () => {
    const phone = await newDevice();
    phone.saveSong(song('a'));
    await settle();

    const tablet = await newDevice();
    expect(ids(await tablet.syncWithRemote())).toEqual(['a']);
    expect(ids(tablet.loadSongs())).toEqual(['a']);
  });
});

describe('song order', () => {
  it('a reorder is saved to the server', async () => {
    const store = await newDevice();
    ['a', 'b', 'c'].forEach((id) => store.saveSong(song(id)));
    await settle();
    store.saveSongOrder(['c', 'a', 'b']);
    await settle();

    expect(serverOrder()).toEqual(['c', 'a', 'b']);
    expect(ids(store.loadSongs())).toEqual(['c', 'a', 'b']);
    expect(pending()).toEqual([]);
  });

  it('another device picks up the order', async () => {
    const phone = await newDevice();
    ['a', 'b', 'c'].forEach((id) => phone.saveSong(song(id)));
    await settle();
    phone.saveSongOrder(['b', 'c', 'a']);
    await settle();

    const tablet = await newDevice();
    expect(ids(await tablet.syncWithRemote())).toEqual(['b', 'c', 'a']);
    expect(ids(tablet.loadSongs())).toEqual(['b', 'c', 'a']);
  });

  it('a reorder made offline is uploaded when back online', async () => {
    const store = await newDevice();
    ['a', 'b'].forEach((id) => store.saveSong(song(id)));
    await settle();

    net.onLine = false;
    store.saveSongOrder(['b', 'a']);
    await settle();
    expect(serverOrder()).toEqual(['a', 'b']);

    net.onLine = true;
    expect(ids(await store.syncWithRemote())).toEqual(['b', 'a']);
    expect(serverOrder()).toEqual(['b', 'a']);
  });

  it('a reorder made during a sync is not undone by the older server order', async () => {
    const store = await newDevice();
    ['a', 'b', 'c'].forEach((id) => store.saveSong(song(id)));
    await settle();
    store.saveSongOrder(['a', 'b', 'c']);
    await settle();

    const gate = deferred();
    server.hold = gate.promise;
    store.saveSong(song('a', 'renamed')); // sync in flight
    await settle();
    store.saveSongOrder(['c', 'b', 'a']); // reorder meanwhile

    server.hold = null;
    gate.release();
    await settle();

    expect(ids(store.loadSongs())).toEqual(['c', 'b', 'a']);
    expect(serverOrder()).toEqual(['c', 'b', 'a']);
    expect(pending()).toEqual([]);
  });

  it('a reorder that fails to upload is kept and retried', async () => {
    const store = await newDevice();
    ['a', 'b'].forEach((id) => store.saveSong(song(id)));
    await settle();

    server.rpcError = { code: '500' };
    store.saveSongOrder(['b', 'a']);
    await settle();
    expect(ids(store.loadSongs())).toEqual(['b', 'a']);
    expect(pending().map((p) => p.type)).toEqual(['order']);

    server.rpcError = null;
    await store.syncWithRemote();
    expect(serverOrder()).toEqual(['b', 'a']);
    expect(pending()).toEqual([]);
  });

  it('the device order is kept when the server has never been ordered', async () => {
    server.rows.set('a', { ...row('a'), created_at: 1 });
    server.rows.set('b', { ...row('b'), created_at: 2 });
    const store = await newDevice();
    storage.setItem('metronom.order.v1', JSON.stringify(['b', 'a']));

    expect(ids(await store.syncWithRemote())).toEqual(['b', 'a']);
  });

  it('songs not in the saved order go at the end, in list order', async () => {
    const store = await newDevice();
    storage.setItem(
      'metronom.songs.v1',
      JSON.stringify(['a', 'b', 'c', 'd'].map((id) => song(id)))
    );
    storage.setItem('metronom.order.v1', JSON.stringify(['c', 'a']));
    expect(ids(store.loadSongs())).toEqual(['c', 'a', 'b', 'd']);
  });

  describe('before the database migration', () => {
    beforeEach(() => {
      server.migrated = false;
    });

    it('songs still sync, and the reorder waits on the device', async () => {
      const store = await newDevice();
      ['a', 'b'].forEach((id) => store.saveSong(song(id)));
      store.saveSongOrder(['b', 'a']);
      await settle();

      expect([...server.rows.keys()].sort()).toEqual(['a', 'b']);
      expect(pending().map((p) => p.type)).toEqual(['order']);
      expect(ids(store.loadSongs())).toEqual(['b', 'a']);
    });

    it('a waiting reorder does not block songs saved after it', async () => {
      const store = await newDevice();
      ['a', 'b'].forEach((id) => store.saveSong(song(id)));
      await settle();
      store.saveSongOrder(['b', 'a']);
      await settle();
      store.saveSong(song('c'));
      await settle();

      expect([...server.rows.keys()].sort()).toEqual(['a', 'b', 'c']);
      expect(pending().map((p) => p.type)).toEqual(['order']);
    });

    it('the waiting reorder is uploaded once the migration is applied', async () => {
      const store = await newDevice();
      ['a', 'b'].forEach((id) => store.saveSong(song(id)));
      store.saveSongOrder(['b', 'a']);
      await settle();

      server.migrated = true;
      expect(ids(await store.syncWithRemote())).toEqual(['b', 'a']);
      expect(serverOrder()).toEqual(['b', 'a']);
      expect(pending()).toEqual([]);
    });
  });
});

describe('error reports', () => {
  async function captureReports() {
    const reports: Report[] = [];
    (await import('./report')).setReporter((r) => reports.push(r));
    return reports;
  }

  it('a server error during sync is reported', async () => {
    const store = await newDevice();
    const reports = await captureReports();
    server.failUpsertFor = 'a';
    store.saveSong(song('a', 'My Private Song'));
    await settle();

    expect(reports.map((r) => r.where)).toEqual(['store.sync']);
    expect(reports[0].error.message).toContain('500');
    expect(JSON.stringify(reports)).not.toContain('Private');
  });

  it('having no connection is not reported', async () => {
    const store = await newDevice();
    const reports = await captureReports();
    server.networkDown = true;
    store.saveSong(song('a'));
    await settle();

    expect(reports).toEqual([]);
    expect(pending()).toHaveLength(1);
  });

  it('corrupt song storage is reported instead of silently showing no songs', async () => {
    const store = await newDevice();
    const reports = await captureReports();
    storage.setItem('metronom.songs.v1', '{not json');
    expect(store.loadSongs()).toEqual([]);
    expect(reports.map((r) => [r.where, r.extra])).toEqual([
      ['store.read', { key: 'metronom.songs.v1' }],
    ]);
  });
});

it('clearLocalData empties the device', async () => {
  net.onLine = false;
  const store = await newDevice();
  store.saveSong(song('a'));
  store.saveSongOrder(['a']);
  store.clearLocalData();

  expect(store.loadSongs()).toEqual([]);
  expect(pending()).toEqual([]);
  expect(storage.getItem('metronom.order.v1')).toBeNull();
});

function row(id: string): Row {
  return {
    id,
    user_id: 'user-1',
    name: `Song ${id}`,
    bpm: 120,
    time_signature: '4/4',
    sections: [],
    position: null,
    created_at: 0,
  };
}
