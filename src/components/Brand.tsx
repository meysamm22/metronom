/**
 * The segno sign (𝄋): the score marking that tells players where to go next.
 * Drawn as SVG because many phone fonts lack the musical-symbol glyph.
 */
export function SegnoMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden
    >
      {/* the S */}
      <path
        d="M22.5 8.8c-1.4-3-6.6-4-9.2-1.4-2.6 2.7.1 5.4 3.6 7 3.5 1.6 6.9 4 4.6 7.8-2 3.3-7.9 3.1-10-.2"
        strokeWidth={2.7}
      />
      {/* the slash */}
      <path d="M7 27.5 25 4.5" strokeWidth={1.7} />
      {/* the dots, in the quadrants the slash leaves open */}
      <circle cx={5.6} cy={12.8} r={2.1} fill="currentColor" stroke="none" />
      <circle cx={26.4} cy={19.2} r={2.1} fill="currentColor" stroke="none" />
    </svg>
  );
}

const SIZES = {
  md: { mark: 'w-8 h-8', text: 'text-[1.7rem]' },
  lg: { mark: 'w-12 h-12', text: 'text-[2.6rem]' },
};

/** "Segno Cue" wordmark: serif name, italic accent, segno sign. */
export function Wordmark({ size = 'md' }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className="inline-flex items-center gap-2 leading-none">
      <SegnoMark className={`${s.mark} text-amber-400 shrink-0`} />
      <span
        className={`font-display ${s.text} font-semibold tracking-tight text-slate-50`}
      >
        Segno{' '}
        <span className="italic font-normal text-indigo-300">Cue</span>
      </span>
    </span>
  );
}

export const TAGLINE = 'Your roadmap through every song';
