import { useState } from 'react';
import type { Song, Section, TimeSignature, CueConfig } from '../types';
import { getBeatsPerBar, generateId } from '../types';

interface Props {
  song?: Song;
  onSave: (song: Song) => void;
  onCancel: () => void;
}

const TIME_SIGS: TimeSignature[] = ['4/4', '3/4', '6/8'];

function defaultCueWords(ts: TimeSignature, sectionName: string): string[] {
  const n = getBeatsPerBar(ts);
  const words = [sectionName];
  for (let i = 1; i <= n; i++) words.push(String(i));
  return words;
}

function emptySection(): Section {
  return { name: '', bars: 4 };
}

export default function SongEditor({ song, onSave, onCancel }: Props) {
  const [name, setName] = useState(song?.name ?? '');
  const [bpm, setBpm] = useState(song?.bpm ?? 120);
  const [ts, setTs] = useState<TimeSignature>(song?.timeSignature ?? '4/4');
  const [sections, setSections] = useState<Section[]>(
    song?.sections ?? [emptySection()]
  );
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [reversedOrder, setReversedOrder] = useState(false);

  const beatsPerBar = getBeatsPerBar(ts);

  const toggleCollapse = (idx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsed(new Set(sections.map((_, i) => i)));
  };

  const expandAll = () => {
    setCollapsed(new Set());
  };

  const updateSection = (idx: number, patch: Partial<Section>) => {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    );
  };

  const toggleCue = (idx: number) => {
    const s = sections[idx];
    if (s.cue) {
      updateSection(idx, { cue: undefined });
    } else {
      updateSection(idx, {
        cue: {
          bar: s.bars,
          words: defaultCueWords(ts, s.name || 'Next'),
        },
      });
    }
  };

  const updateCue = (sectionIdx: number, patch: Partial<CueConfig>) => {
    const s = sections[sectionIdx];
    if (!s.cue) return;
    updateSection(sectionIdx, { cue: { ...s.cue, ...patch } });
  };

  const updateCueWord = (sectionIdx: number, wordIdx: number, word: string) => {
    const s = sections[sectionIdx];
    if (!s.cue) return;
    const words = [...s.cue.words];
    words[wordIdx] = word;
    updateCue(sectionIdx, { words });
  };

  const addCueBeat = (sectionIdx: number) => {
    const s = sections[sectionIdx];
    if (!s.cue) return;
    const countBeats = s.cue.words.length - 1;
    const words = [...s.cue.words, String(countBeats + 1)];
    updateCue(sectionIdx, { words });
  };

  const removeCueBeat = (sectionIdx: number) => {
    const s = sections[sectionIdx];
    if (!s.cue || s.cue.words.length <= 1) return;
    const words = s.cue.words.slice(0, -1);
    updateCue(sectionIdx, { words });
  };

  const addSection = () => {
    setSections([...sections, emptySection()]);
  };

  const removeSection = (idx: number) => {
    if (sections.length <= 1) return;
    setSections(sections.filter((_, i) => i !== idx));
    setCollapsed((prev) => {
      const next = new Set<number>();
      prev.forEach((v) => {
        if (v < idx) next.add(v);
        else if (v > idx) next.add(v - 1);
      });
      return next;
    });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    setSections(next);
    setCollapsed((prev) => {
      const updated = new Set<number>();
      prev.forEach((v) => {
        if (v === idx) updated.add(target);
        else if (v === target) updated.add(idx);
        else updated.add(v);
      });
      return updated;
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (sections.some((s) => !s.name.trim() || s.bars < 1)) return;

    const finalSections = sections.map((s) => {
      if (s.cue) {
        const words = [...s.cue.words];
        if (words.length === 0) words.push('Next');
        return { ...s, cue: { ...s.cue, words } };
      }
      return s;
    });

    onSave({
      id: song?.id ?? generateId(),
      name: name.trim(),
      bpm,
      timeSignature: ts,
      sections: finalSections,
    });
  };

  const displayOrder = reversedOrder
    ? sections.map((s, i) => ({ section: s, originalIdx: i })).reverse()
    : sections.map((s, i) => ({ section: s, originalIdx: i }));

  const allCollapsed = collapsed.size === sections.length;

  const inputClass =
    'w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-indigo-500 focus:outline-none';

  return (
    <div className="flex flex-col h-screen bg-slate-900 relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          Cancel
        </button>
        <h1 className="text-lg font-bold">
          {song ? 'Edit Song' : 'New Song'}
        </h1>
        <button
          onClick={handleSave}
          className="text-indigo-400 hover:text-indigo-300 font-semibold"
        >
          Save
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-5">
        {/* Song basics */}
        <div>
          <label className="block text-sm text-slate-400 mb-1">Song Name</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Song"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">BPM</label>
            <input
              type="number"
              className={inputClass}
              value={bpm}
              min={20}
              max={300}
              onChange={(e) => setBpm(Number(e.target.value) || 120)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">
              Time Signature
            </label>
            <select
              className={inputClass}
              value={ts}
              onChange={(e) => setTs(e.target.value as TimeSignature)}
            >
              {TIME_SIGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sections header with controls */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Sections ({sections.length})
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setReversedOrder(!reversedOrder)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                title="Reverse display order"
              >
                {reversedOrder ? '↑ Normal' : '↓ Reverse'}
              </button>
              <button
                onClick={allCollapsed ? expandAll : collapseAll}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {allCollapsed ? 'Expand All' : 'Collapse All'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {displayOrder.map(({ section, originalIdx: idx }) => {
              const isCollapsed = collapsed.has(idx);

              return (
                <div
                  key={idx}
                  className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
                >
                  {/* Collapsible header — always visible */}
                  <button
                    onClick={() => toggleCollapse(idx)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-750 transition-colors"
                  >
                    <span
                      className={`text-slate-500 text-xs transition-transform duration-200 ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                    >
                      ▶
                    </span>
                    <span className="text-slate-500 text-xs font-mono">
                      #{idx + 1}
                    </span>
                    <span className="font-medium text-sm truncate flex-1">
                      {section.name || 'Untitled'}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {section.bars}b
                    </span>
                    {section.cue && (
                      <span className="text-amber-500 text-xs">CUE</span>
                    )}
                  </button>

                  {/* Expandable body */}
                  {!isCollapsed && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-700/50">
                      {/* Actions row */}
                      <div className="flex gap-1 justify-end mb-3">
                        <button
                          onClick={() => moveSection(idx, -1)}
                          disabled={idx === 0}
                          className="text-slate-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSection(idx, 1)}
                          disabled={idx === sections.length - 1}
                          className="text-slate-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeSection(idx)}
                          disabled={sections.length <= 1}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 text-sm px-2 py-1"
                        >
                          ✕ Remove
                        </button>
                      </div>

                      {/* Section fields */}
                      <div className="flex gap-3 mb-3">
                        <div className="flex-1">
                          <label className="block text-xs text-slate-500 mb-1">
                            Name
                          </label>
                          <input
                            className={inputClass}
                            value={section.name}
                            onChange={(e) =>
                              updateSection(idx, { name: e.target.value })
                            }
                            placeholder="e.g. Verse 1"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs text-slate-500 mb-1">
                            Bars
                          </label>
                          <input
                            type="number"
                            className={inputClass}
                            value={section.bars}
                            min={1}
                            max={99}
                            onChange={(e) =>
                              updateSection(idx, {
                                bars: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </div>
                      </div>

                      {/* Cue toggle */}
                      <div>
                        <button
                          onClick={() => toggleCue(idx)}
                          className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            section.cue
                              ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                              : 'bg-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          {section.cue ? 'Cue Enabled' : '+ Add Cue'}
                        </button>
                      </div>

                      {/* Cue config */}
                      {section.cue && (
                        <div className="mt-3 pl-3 border-l-2 border-amber-600/30">
                          <div className="mb-2">
                            <label className="block text-xs text-slate-500 mb-1">
                              Play cue on bar #
                            </label>
                            <input
                              type="number"
                              className={`${inputClass} w-20`}
                              value={section.cue.bar}
                              min={1}
                              max={section.bars}
                              onChange={(e) =>
                                updateCue(idx, {
                                  bar: Math.min(
                                    section.bars,
                                    Math.max(1, Number(e.target.value) || 1)
                                  ),
                                })
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs text-slate-500">
                              Voice cue + beat counts
                            </label>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => removeCueBeat(idx)}
                                disabled={section.cue!.words.length <= 1}
                                className="w-7 h-7 rounded-md bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 disabled:opacity-30 text-sm font-bold flex items-center justify-center"
                              >
                                −
                              </button>
                              <span className="text-xs text-slate-500 w-16 text-center">
                                {section.cue!.words.length - 1} beats
                              </span>
                              <button
                                onClick={() => addCueBeat(idx)}
                                className="w-7 h-7 rounded-md bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 text-sm font-bold flex items-center justify-center"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap items-end">
                            <div>
                              <span className="block text-[10px] text-amber-500/70 mb-0.5 text-center">Voice</span>
                              <input
                                className={`${inputClass} w-24 text-center text-sm border-amber-600/40`}
                                value={section.cue!.words[0] ?? ''}
                                onChange={(e) =>
                                  updateCueWord(idx, 0, e.target.value)
                                }
                                placeholder="e.g. Chorus"
                              />
                            </div>
                            {section.cue!.words.slice(1).map((word, bi) => (
                              <div key={bi}>
                                <span className="block text-[10px] text-slate-600 mb-0.5 text-center">Beat {bi + 1}</span>
                                <input
                                  className={`${inputClass} w-16 text-center text-sm`}
                                  value={word}
                                  onChange={(e) =>
                                    updateCueWord(idx, bi + 1, e.target.value)
                                  }
                                  placeholder={String(bi + 1)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Add Section button */}
      <button
        onClick={addSection}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-3xl font-light shadow-lg shadow-indigo-900/50 flex items-center justify-center transition-colors z-10"
        title="Add Section"
      >
        +
      </button>
    </div>
  );
}
