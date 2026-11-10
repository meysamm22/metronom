import type { TimeSignature } from '../types';
import { TIME_SIGNATURES, getGrouping } from '../types';

interface Props {
  value: TimeSignature;
  onChange: (ts: TimeSignature) => void;
}

/** One-tap meter picker: equal tiles in a 3×3 grid, grouping shown on each. */
export default function TimeSignaturePicker({ value, onChange }: Props) {
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-3">
      <div className="grid grid-cols-3 gap-2">
        {TIME_SIGNATURES.map((t) => {
          const on = t === value;
          return (
            <button
              key={t}
              onClick={() => onChange(t)}
              className={`h-14 rounded-xl border flex flex-col items-center justify-center transition-colors ${
                on
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-300 active:bg-slate-700'
              }`}
            >
              <span className="text-lg font-bold leading-none">{t}</span>
              <span
                className={`text-[10px] mt-1 leading-none ${
                  on ? 'text-indigo-200' : 'text-slate-500'
                }`}
              >
                {getGrouping(t) ?? ' '}
              </span>
            </button>
          );
        })}
      </div>
      {value.endsWith('/8') && (
        <p className="text-xs text-slate-500 text-center mt-3">
          Each click is an eighth note · BPM counts eighth notes
        </p>
      )}
    </div>
  );
}
