import type { Song } from './types';
import { generateId } from './types';

export const demoSongs: Song[] = [
  {
    id: generateId(),
    name: 'Demo Song A (4/4 @ 120)',
    bpm: 120,
    timeSignature: '4/4',
    sections: [
      {
        name: 'Count-in',
        bars: 2,
        cue: { bar: 2, words: ['Verse', '1', '2', '3', '4'] },
      },
      {
        name: 'Verse 1',
        bars: 8,
        cue: { bar: 8, words: ['Chorus', '1', '2', '3', '4'] },
      },
      {
        name: 'Chorus',
        bars: 4,
        cue: { bar: 4, words: ['Bridge', '1', '2', '3', '4'] },
      },
      {
        name: 'Bridge',
        bars: 4,
      },
    ],
  },
  {
    id: generateId(),
    name: 'Waltz Demo (3/4 @ 90)',
    bpm: 90,
    timeSignature: '3/4',
    sections: [
      {
        name: 'Intro',
        bars: 2,
        cue: { bar: 2, words: ['Melody', '1', '2', '3'] },
      },
      {
        name: 'Melody',
        bars: 8,
      },
    ],
  },
  {
    id: generateId(),
    name: '6/8 Groove (6/8 @ 140)',
    bpm: 140,
    timeSignature: '6/8',
    sections: [
      {
        name: 'Intro',
        bars: 2,
        cue: { bar: 2, words: ['Main', '1', '2', '3', '4', '5', '6'] },
      },
      {
        name: 'Main Groove',
        bars: 8,
      },
    ],
  },
];
