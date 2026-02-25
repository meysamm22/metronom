export const CUE_WORDS = [
  'intro', 'outro', 'melody', 'verse', 'chorus',
  'bridge', 'silence', 'stop', 'start',
  '1', '2', '3', '4', '5', '6',
] as const;

export type CueWord = (typeof CUE_WORDS)[number];

export const SECTION_NAMES: CueWord[] = [
  'intro', 'outro', 'melody', 'verse', 'chorus',
  'bridge', 'silence', 'stop', 'start',
];

export const COUNT_NUMBERS: CueWord[] = ['1', '2', '3', '4', '5', '6'];

const bufferCache = new Map<string, AudioBuffer>();

export async function loadCueBuffer(
  ctx: AudioContext,
  word: string
): Promise<AudioBuffer | null> {
  if (bufferCache.has(word)) return bufferCache.get(word)!;

  try {
    const resp = await fetch(`/audio/${word}.wav`);
    const arrayBuf = await resp.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    bufferCache.set(word, audioBuf);
    return audioBuf;
  } catch (e) {
    console.warn(`Failed to load cue audio for "${word}"`, e);
    return null;
  }
}

export async function preloadAllCueBuffers(ctx: AudioContext): Promise<void> {
  await Promise.all(CUE_WORDS.map((w) => loadCueBuffer(ctx, w)));
}

export function getCueBuffer(word: string): AudioBuffer | null {
  return bufferCache.get(word) ?? null;
}
