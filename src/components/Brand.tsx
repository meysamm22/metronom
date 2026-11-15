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
      {/* Same geometry as the app icon (assets/build-icons.mjs). The S
          leans and is wider than a letter S, and the slash is long and
          shallow, so the sign doesn't read as "$". */}
      <path
        d="M24.6 10.2C25.4 6.4 20.6 4.4 16.8 4.6 12.6 4.8 10.4 7.8 11.6 10.6 12.8 13.4 17.2 14.6 19.6 16.2 22.4 18 22.6 21.6 20.6 23.6 18.6 25.6 13.2 26.2 10.2 24.2 8.6 23 7.8 22.2 7.4 21.6"
        transform="translate(16 16) rotate(-10) scale(1.14 0.85) translate(-16 -16)"
        strokeWidth={2.6}
      />
      {/* the slash */}
      <path d="M4 25.5 28 6.5" strokeWidth={1.8} />
      {/* a dot either side */}
      <circle cx={3.4} cy={14.6} r={2.3} fill="currentColor" stroke="none" />
      <circle cx={28.6} cy={17.4} r={2.3} fill="currentColor" stroke="none" />
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
