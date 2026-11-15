# Segno Cue

Click and spoken cues that guide musicians through every section of a song. Map out a song's sections, set the tempo and time signature, and the app counts you in and calls out what's next ("chorus, 2, 3, 4") on the beat. Runs as a native iOS/Android app via [Capacitor](https://capacitorjs.com/) (and as a web app/PWA).

The name comes from the *segno* (𝄋), the score marking that tells players where to go next.

## Mobile apps (Capacitor)

The app is fully offline-capable: songs are stored on the device (localStorage) and sync to Supabase in the background when online. All click/cue audio ships inside the app binary.

### Build for iOS (requires a Mac with Xcode)

```bash
npm install
npm run ios   # builds the web app, syncs, and opens Xcode
```

In Xcode: select your signing team under Signing & Capabilities, then build/run on a device or archive for App Store submission. An Apple Developer account is required for device installs and App Store distribution.

The iOS shell is preconfigured for live use:

- `AVAudioSession` is set to the `playback` category (`AppDelegate.swift`), so the click ignores the ring/silent switch and can mix with backing tracks.
- `UIBackgroundModes: audio` is enabled in `Info.plist`.
- The screen is kept awake while a song is playing (keep-awake plugin), so the look-ahead scheduler is never suspended mid-song.

### Build for Android

```bash
npm install
npm run android   # builds the web app, syncs, and opens Android Studio
```

### Supabase configuration

Create a `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before building. Without them the app still works in local-only mode (no account/sync).

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
