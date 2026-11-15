import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import type { Song } from '../types';

// Inline SVG so icons render at exactly the same size on iOS and Android
// (the old ✎ glyph and 🗑 emoji came from different fonts).
const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const EditIcon = () => (
  <svg {...iconProps}>
    <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z" />
    <path d="M13.5 6.5l3 3" />
  </svg>
);

const TrashIcon = () => (
  <svg {...iconProps}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V4h6v3" />
  </svg>
);

const GripIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    {[6, 12, 18].map((y) =>
      [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />)
    )}
  </svg>
);

interface Props {
  songs: Song[];
  loading: boolean;
  signedIn: boolean;
  onSelect: (song: Song) => void;
  onEdit: (song: Song) => void;
  onDelete: (id: string) => void;
  onReorder: (songs: Song[]) => void;
  onNew: () => void;
  onLogout: () => void;
}

interface RowProps {
  song: Song;
  onSelect: (song: Song) => void;
  onEdit: (song: Song) => void;
  onDelete: (id: string) => void;
}

function SongRow({ song, onSelect, onEdit, onDelete }: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`relative flex items-center pr-4 py-3 border-b border-slate-800 bg-slate-900 ${
        isDragging
          ? 'z-10 bg-slate-800 shadow-2xl shadow-black/60 rounded-xl border-transparent'
          : 'active:bg-slate-800'
      }`}
    >
      {/* Drag handle: only this starts a drag, so the list still scrolls. */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className={`self-stretch flex items-center pl-3 pr-2 touch-none cursor-grab ${
          isDragging ? 'text-indigo-400 cursor-grabbing' : 'text-slate-600'
        }`}
        aria-label={`Reorder ${song.name}`}
      >
        <GripIcon />
      </button>

      <button
        onClick={() => onSelect(song)}
        className="flex-1 text-left min-w-0"
      >
        <div className="font-semibold truncate">{song.name}</div>
        <div className="text-sm text-slate-500 mt-0.5">
          {song.bpm} BPM · {song.timeSignature} · {song.sections.length}{' '}
          sections · {song.sections.reduce((a, s) => a + s.bars, 0)} bars
        </div>
      </button>

      <div className="flex gap-2 ml-3 flex-shrink-0">
        <button
          onClick={() => onEdit(song)}
          className="text-slate-500 hover:text-indigo-400 active:text-indigo-400 p-2"
          title="Edit"
          aria-label="Edit"
        >
          <EditIcon />
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${song.name}"?`)) onDelete(song.id);
          }}
          className="text-slate-500 hover:text-red-400 active:text-red-400 p-2"
          title="Delete"
          aria-label="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

export default function SongList({
  songs,
  loading,
  signedIn,
  onSelect,
  onEdit,
  onDelete,
  onReorder,
  onNew,
  onLogout,
}: Props) {
  const sensors = useSensors(
    // A few px of movement before a drag starts, so taps on the handle
    // don't register as drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = songs.findIndex((s) => s.id === active.id);
    const to = songs.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(songs, from, to));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
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
          {signedIn ? 'Log out' : 'Log in'}
        </button>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={songs.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {songs.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
