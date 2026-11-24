import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Source maps go to Sentry so crash reports show real code, but only when a
// Sentry token is set up locally (.env.sentry-build-plugin, gitignored, with
// SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT). They are deleted right
// after upload, so they never ship in the app or on the website.
const SENTRY_ENV_FILE = '.env.sentry-build-plugin'
const uploadSourceMaps =
  Boolean(process.env.SENTRY_AUTH_TOKEN) ||
  (existsSync(SENTRY_ENV_FILE) &&
    /^SENTRY_AUTH_TOKEN=\S/m.test(readFileSync(SENTRY_ENV_FILE, 'utf8')))

export default defineConfig({
  build: {
    sourcemap: uploadSourceMaps ? 'hidden' : false,
  },
  plugins: [
    react(),
    tailwindcss(),
    uploadSourceMaps &&
      sentryVitePlugin({
        telemetry: false,
        // Maps are matched to crashes by debug IDs. No release here: it
        // would send git history (author emails) and wouldn't match the
        // app's own release name (bundle id @ version + build).
        release: { create: false, setCommits: false, finalize: false, inject: false },
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      }),
  ],
  test: {
    // Plain Node: tests stub the few browser APIs they need (AudioContext,
    // localStorage, navigator) so timing is fully under their control.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
})
