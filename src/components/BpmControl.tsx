import { useEffect, useRef, useState } from 'react';

export const MIN_BPM = 20;
export const MAX_BPM = 300;

const clamp = (n: number) =>
  Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));

interface Props {
  value: number;
  onChange: (bpm: number) => void;
  /** Shown under the number, e.g. "eighth notes" for x/8 meters. */
  unitHint?: string;
}

/**
 * Tempo control: big readout (tap to type), hold-to-repeat −/+ steppers for
 * fine changes, a slider for big jumps, and tap tempo.
 */
export default function BpmControl({ value, onChange, unitHint }: Props) {
  const valueRef = useRef(value);
  valueRef.current = value;

  // ---- hold-to-repeat steppers ----
  const holdTimer = useRef<number | null>(null);
  const stopHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const startHold = (delta: number) => {
    stopHold();
    onChange(clamp(valueRef.current + delta));
    let ticks = 0;
    const tick = () => {
      ticks++;
      // Speed up after a second of holding: ±1 → ±5.
      const step = ticks > 15 ? delta * 5 : delta;
      onChange(clamp(valueRef.current + step));
      holdTimer.current = window.setTimeout(tick, 70);
    };
    holdTimer.current = window.setTimeout(tick, 400);
  };
  useEffect(() => stopHold, []);

  // ---- tap tempo ----
  const taps = useRef<number[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const handleTap = () => {
    const now = performance.now();
    const recent = taps.current.filter((t) => now - t < 2000);
    // A gap over 2 s starts a fresh measurement.
    taps.current = [...recent, now].slice(-8);
    setTapCount(taps.current.length);
    if (taps.current.length >= 2) {
      const t = taps.current;
      const avgMs = (t[t.length - 1] - t[0]) / (t.length - 1);
      onChange(clamp(60000 / avgMs));
    }
  };

  // ---- tap the number to type ----
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commitDraft = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(clamp(n));
    setEditing(false);
  };

  const stepBtn =
    'w-14 h-14 rounded-2xl bg-slate-800 border border-slate-600 text-3xl font-light text-slate-200 active:bg-slate-700 flex items-center justify-center select-none touch-none';

  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          className={stepBtn}
          aria-label="Slower"
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}
        >
          −
        </button>

        <div className="flex-1 text-center">
          {editing ? (
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => e.key === 'Enter' && commitDraft()}
              className="w-28 bg-slate-900 border border-indigo-500 rounded-lg text-center font-display text-4xl font-semibold text-white py-1 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setDraft(String(value));
                setEditing(true);
              }}
              className="font-display text-5xl font-semibold tabular-nums text-white leading-none"
              aria-label="Type tempo"
            >
              {value}
            </button>
          )}
          <div className="text-xs text-slate-500 mt-1">
            BPM{unitHint ? ` · ${unitHint}` : ''}
          </div>
        </div>

        <button
          className={stepBtn}
          aria-label="Faster"
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}
        >
          +
        </button>
      </div>

      <input
        type="range"
        className="bpm-slider w-full mt-5"
        min={MIN_BPM}
        max={MAX_BPM}
        step={1}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-label="Tempo"
      />
      <div className="flex justify-between text-[11px] text-slate-600 mt-1 px-0.5">
        <span>{MIN_BPM}</span>
        <span>100</span>
        <span>200</span>
        <span>{MAX_BPM}</span>
      </div>

      <button
        onClick={handleTap}
        className="w-full mt-4 h-12 rounded-xl bg-slate-800 border border-slate-600 text-slate-300 font-semibold active:bg-indigo-600 active:text-white active:border-indigo-500 select-none"
      >
        Tap tempo{tapCount >= 2 ? ` · ${tapCount} taps` : ''}
      </button>
    </div>
  );
}
