import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Song } from './types';
import { supabase, isSupabaseConfigured } from './supabase';
import {
  loadSongs,
  saveSong,
  deleteSong as removeFromStore,
  syncWithRemote,
  clearLocalData,
} from './store';
import { demoSongs } from './demoSongs';
import Auth from './components/Auth';
import SongList from './components/SongList';
import SongEditor from './components/SongEditor';
import Player from './components/Player';

type View = 'list' | 'player' | 'editor';

// Set once the user has either signed in or chosen to use the app offline.
// Guarantees the app never locks the user out on stage when the network (and
// therefore session refresh) is unavailable.
const LOCAL_OK_KEY = 'metronom.localOk';
const SEEDED_KEY = 'metronom.demosSeeded';

function seedDemosIfNeeded(): void {
  if (localStorage.getItem(SEEDED_KEY)) return;
  if (loadSongs().length === 0) {
    for (const s of demoSongs) {
      saveSong(s);
    }
  }
  localStorage.setItem(SEEDED_KEY, '1');
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [localOk, setLocalOk] = useState(
    () => localStorage.getItem(LOCAL_OK_KEY) === '1'
  );
  const [view, setView] = useState<View>('list');
  // Local store is synchronous: songs are available on first render, offline.
  const [songs, setSongs] = useState<Song[]>(() => loadSongs());
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const applySession = (session: Session | null) => {
      setSession(session);
      if (session) {
        localStorage.setItem(LOCAL_OK_KEY, '1');
        setLocalOk(true);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => applySession(session))
      .catch(() => setSession(null))
      .finally(() => setAuthReady(true));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(() => {
    setSongs(loadSongs());
  }, []);

  const sync = useCallback(async () => {
    const remote = await syncWithRemote();
    if (remote) setSongs(remote);
  }, []);

  // Initial sync + demo seeding, once auth state is known and the user is
  // actually in the app (signed in or explicitly offline).
  useEffect(() => {
    if (!authReady || (!session && !localOk)) return;
    (async () => {
      await sync();
      seedDemosIfNeeded();
      refresh();
    })();
  }, [authReady, session, localOk, sync, refresh]);

  // Re-sync whenever connectivity returns.
  useEffect(() => {
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync]);

  const handleSelect = (song: Song) => {
    setSelectedSong(song);
    setView('player');
  };

  const handleEdit = (song: Song) => {
    setEditingSong(song);
    setView('editor');
  };

  const handleNew = () => {
    setEditingSong(undefined);
    setView('editor');
  };

  const handleDelete = (id: string) => {
    removeFromStore(id);
    refresh();
  };

  const handleSave = (song: Song) => {
    saveSong(song);
    refresh();
    setView('list');
  };

  const handleBack = () => {
    setView('list');
    setSelectedSong(null);
  };

  const handleLogout = async () => {
    if (session) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Offline sign-out: clear local state anyway.
      }
      clearLocalData();
      localStorage.removeItem(SEEDED_KEY);
      setSongs([]);
    }
    localStorage.removeItem(LOCAL_OK_KEY);
    setLocalOk(false);
    setSession(null);
    setView('list');
    setSelectedSong(null);
    setEditingSong(undefined);
  };

  const handleContinueOffline = () => {
    localStorage.setItem(LOCAL_OK_KEY, '1');
    setLocalOk(true);
  };

  if (!authReady && !localOk) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-500">
        Loading...
      </div>
    );
  }

  if (isSupabaseConfigured && !session && !localOk) {
    return <Auth onContinueOffline={handleContinueOffline} />;
  }

  if (view === 'player' && selectedSong) {
    return <Player song={selectedSong} onBack={handleBack} />;
  }

  if (view === 'editor') {
    return (
      <SongEditor
        song={editingSong}
        onSave={handleSave}
        onCancel={() => setView('list')}
      />
    );
  }

  return (
    <SongList
      songs={songs}
      loading={false}
      signedIn={!!session}
      onSelect={handleSelect}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onNew={handleNew}
      onLogout={handleLogout}
    />
  );
}
