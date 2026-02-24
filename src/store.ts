import type { Song, Section } from './types';
import { supabase } from './supabase';

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

export async function loadSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load songs:', error.message);
    return [];
  }

  return (data as SongRow[]).map(rowToSong);
}

export async function saveSong(song: Song): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase.from('songs').upsert({
    id: song.id,
    user_id: user.id,
    name: song.name,
    bpm: song.bpm,
    time_signature: song.timeSignature,
    sections: song.sections,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to save song:', error.message);
  }
}

export async function deleteSong(id: string): Promise<void> {
  const { error } = await supabase.from('songs').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete song:', error.message);
  }
}
