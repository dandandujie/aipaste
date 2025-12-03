import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    svelte(),
    electron({
      main: {
        entry: 'electron/main.ts',
        onstart({ startup }) {
          startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      renderer: {},
    }),
  ],
  server: {
    watch: {
      usePolling: true,
    },
  },
})
