import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// `vite --mode desktop` / `vite build --mode desktop` adds the Electron main +
// preload builds and makes asset URLs relative so dist/index.html works from
// file://. Plain `vite` keeps producing the web app.
export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop'
  const cjs = { rollupOptions: { output: { format: 'cjs' as const, entryFileNames: '[name].cjs' } } }
  return {
    base: desktop ? './' : '/',
    define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
    plugins: [
      react(),
      tailwindcss(),
      ...(desktop
        ? [
            electron({
              main: {
                entry: 'electron/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    lib: { entry: 'electron/main.ts', formats: ['cjs'], fileName: () => 'main.cjs' },
                    rollupOptions: { output: { format: 'cjs' } },
                  },
                },
              },
              preload: {
                input: 'electron/preload.ts',
                vite: { build: { outDir: 'dist-electron', ...cjs } },
              },
            }),
          ]
        : []),
    ],
  }
})
