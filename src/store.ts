import type { Song } from './types';

const STORAGE_KEY = 'metronom_songs';

export function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Song[];
  } catch {
    return [];
  }
}

export function saveSongs(songs: Song[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}

export function saveSong(song: Song) {
  const songs = loadSongs();
  const idx = songs.findIndex((s) => s.id === song.id);
  if (idx >= 0) {
    songs[idx] = song;
  } else {
    songs.push(song);
  }
  saveSongs(songs);
}

export function deleteSong(id: string) {
  const songs = loadSongs().filter((s) => s.id !== id);
  saveSongs(songs);
}
