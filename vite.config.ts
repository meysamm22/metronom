import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Plain Node: tests stub the few browser APIs they need (AudioContext,
    // localStorage, navigator) so timing is fully under their control.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
})
