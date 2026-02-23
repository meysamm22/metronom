import { useCallback, useEffect, useState } from 'react';
import type { Song } from './types';
import { loadSongs, saveSong, deleteSong as removeFromStore } from './store';
import { demoSongs } from './demoSongs';
import SongList from './components/SongList';
import SongEditor from './components/SongEditor';
import Player from './components/Player';

type View = 'list' | 'player' | 'editor';

const DEMO_INIT_KEY = 'metronom_demo_loaded';

export default function App() {
  const [view, setView] = useState<View>('list');
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | undefined>(undefined);

  useEffect(() => {
    let stored = loadSongs();
    if (stored.length === 0 && !localStorage.getItem(DEMO_INIT_KEY)) {
      demoSongs.forEach((s) => saveSong(s));
      localStorage.setItem(DEMO_INIT_KEY, '1');
      stored = loadSongs();
    }
    setSongs(stored);
  }, []);

  const refresh = useCallback(() => setSongs(loadSongs()), []);

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
      onSelect={handleSelect}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onNew={handleNew}
    />
  );
}
