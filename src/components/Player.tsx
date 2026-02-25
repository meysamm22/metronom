import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audioEngine';
import type { BeatInfo, Song } from '../types';
import { getBeatsPerBar } from '../types';

interface Props {
  song: Song;
  onBack: () => void;
}

export default function Player({ song, onBack }: Props) {
  const engineRef = useRef<AudioEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [beatInfo, setBeatInfo] = useState<BeatInfo | null>(null);
  const [finished, setFinished] = useState(false);
  const beatKeyRef = useRef(0);
  const [beatKey, setBeatKey] = useState(0);

  useEffect(() => {
    const engine = new AudioEngine();
    engineRef.current = engine;
    return () => engine.stop();
  }, []);

  const handleBeat = useCallback((info: BeatInfo) => {
    setBeatInfo(info);
    beatKeyRef.current++;
    setBeatKey(beatKeyRef.current);
  }, []);

  const handleFinish = useCallback(() => {
    setPlaying(false);
    setFinished(true);
    setBeatInfo(null);
  }, []);

  useEffect(() => {
    engineRef.current?.setCallbacks(handleBeat, handleFinish);
  }, [handleBeat, handleFinish]);

  const togglePlay = async () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (playing) {
      engine.stop();
      setPlaying(false);
      setBeatInfo(null);
    } else {
      setFinished(false);
      setPlaying(true);
      await engine.start(song);
    }
  };

  const beatsPerBar = getBeatsPerBar(song.timeSignature);

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-slate-700">
        <button
          onClick={() => {
            engineRef.current?.stop();
            onBack();
          }}
          className="text-slate-400 hover:text-white mr-3 text-2xl leading-none"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{song.name}</h1>
          <p className="text-sm text-slate-400">
            {song.bpm} BPM · {song.timeSignature} · {song.sections.length} sections
          </p>
        </div>
      </div>

      {/* Section overview */}
      <div className="px-4 py-3 border-b border-slate-800 overflow-x-auto">
        <div className="flex gap-2">
          {song.sections.map((section, i) => {
            const isActive = beatInfo?.sectionIndex === i;
            const isPast = beatInfo ? beatInfo.sectionIndex > i : false;
            return (
              <div
                key={i}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isPast
                      ? 'bg-slate-700 text-slate-400'
                      : 'bg-slate-800 text-slate-500'
                }`}
              >
                {section.name}
                <span className="ml-1 opacity-60">{section.bars}b</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main display */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {finished ? (
          <div className="text-center">
            <div className="text-6xl mb-4">✓</div>
            <p className="text-xl text-slate-400">Song finished</p>
          </div>
        ) : beatInfo ? (
          <>
            {/* Section name */}
            <div className="text-slate-400 text-sm font-medium mb-1">
              {beatInfo.sectionName}
            </div>

            {/* Bar counter */}
            <div className="text-slate-300 text-lg mb-6">
              Bar {beatInfo.bar} / {beatInfo.totalBars}
            </div>

            {/* Beat dots */}
            <div className="flex gap-3 mb-8" key={`dots-${beatInfo.sectionIndex}-${beatInfo.bar}`}>
              {Array.from({ length: beatsPerBar }).map((_, i) => {
                const isCurrentBeat = beatInfo.beat === i + 1;
                const isCueBeat = !!beatInfo.cueWord && isCurrentBeat;
                return (
                  <div
                    key={i}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-75 ${
                      isCurrentBeat
                        ? isCueBeat
                          ? 'bg-amber-500 text-black scale-125'
                          : 'bg-green-500 text-black scale-125'
                        : i + 1 < beatInfo.beat
                          ? 'bg-slate-600 text-slate-300'
                          : 'bg-slate-800 text-slate-500'
                    }`}
                    style={isCurrentBeat ? { animation: 'none' } : undefined}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>

            {/* Cue display */}
            <div className="h-16 flex items-center justify-center">
              {beatInfo.cueWord && (
                <div
                  key={beatKey}
                  className="beat-pulse text-4xl font-black text-amber-400 tracking-wider uppercase"
                >
                  {beatInfo.cueWord}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="text-8xl font-black text-slate-600 mb-2">
              {song.bpm}
            </div>
            <div className="text-slate-500 text-lg">BPM</div>
            <p className="text-slate-600 text-sm mt-4">Tap play to start</p>
          </div>
        )}
      </div>

      {/* Play button */}
      <div className="px-4 pb-8 pt-4">
        <button
          onClick={togglePlay}
          className={`w-full py-5 rounded-2xl text-xl font-bold transition-colors ${
            playing
              ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white'
          }`}
        >
          {playing ? '■  Stop' : '▶  Play'}
        </button>
      </div>
    </div>
  );
}
