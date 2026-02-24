import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Song } from './types';
import { supabase } from './supabase';
import { loadSongs, saveSong, deleteSong as removeFromStore } from './store';
import { demoSongs } from './demoSongs';
import Auth from './components/Auth';
import SongList from './components/SongList';
import SongEditor from './components/SongEditor';
import Player from './components/Player';

type View = 'list' | 'player' | 'editor';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>('list');
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    setSongsLoading(true);
    const songs = await loadSongs();
    setSongs(songs);
    setSongsLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      refresh().then(async (  ) => {
        const current = await loadSongs();
        if (current.length === 0) {
          for (const s of demoSongs) {
            await saveSong(s);
          }
          const withDemos = await loadSongs();
          setSongs(withDemos);
        }
      });
    } else {
      setSongs([]);
      setSongsLoading(false);
    }
  }, [session, refresh]);

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

  const handleDelete = async (id: string) => {
    await removeFromStore(id);
    await refresh();
  };

  const handleSave = async (song: Song) => {
    await saveSong(song);
    await refresh();
    setView('list');
  };

  const handleBack = () => {
    setView('list');
    setSelectedSong(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setView('list');
    setSelectedSong(null);
    setEditingSong(undefined);
  };

  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-500">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Auth />;
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
      loading={songsLoading}
      onSelect={handleSelect}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onNew={handleNew}
      onLogout={handleLogout}
    />
  );
}
