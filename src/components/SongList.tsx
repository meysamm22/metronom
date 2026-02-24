import type { Song } from '../types';

interface Props {
  songs: Song[];
  loading: boolean;
  onSelect: (song: Song) => void;
  onEdit: (song: Song) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onLogout: () => void;
}

export default function SongList({
  songs,
  loading,
  onSelect,
  onEdit,
  onDelete,
  onNew,
  onLogout,
}: Props) {
  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Metronom</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Drummer's cue metronome
          </p>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
        >
          Log out
        </button>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            Loading songs...
          </div>
        ) : songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 px-8">
            <div className="text-5xl mb-4 opacity-40">🥁</div>
            <p className="text-center">
              No songs yet. Create your first song to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {songs.map((song) => (
              <div
                key={song.id}
                className="flex items-center px-4 py-3 hover:bg-slate-800/50 active:bg-slate-800 transition-colors"
              >
                {/* Tap to play */}
                <button
                  onClick={() => onSelect(song)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="font-semibold truncate">{song.name}</div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    {song.bpm} BPM · {song.timeSignature} ·{' '}
                    {song.sections.length} sections ·{' '}
                    {song.sections.reduce((a, s) => a + s.bars, 0)} bars
                  </div>
                </button>

                {/* Actions */}
                <div className="flex gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(song);
                    }}
                    className="text-slate-500 hover:text-indigo-400 p-2 text-sm"
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${song.name}"?`)) {
                        onDelete(song.id);
                      }
                    }}
                    className="text-slate-500 hover:text-red-400 p-2 text-sm"
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New song button */}
      <div className="px-4 pb-8 pt-4 border-t border-slate-800">
        <button
          onClick={onNew}
          className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-lg transition-colors"
        >
          + New Song
        </button>
      </div>
    </div>
  );
}
