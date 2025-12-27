import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import tailwindcss from '@tailwindcss/vite'
import { build as esbuild } from 'esbuild'
import path from 'node:path'

function electronPreloadCjs(): Plugin {
  let building = false
  const buildPreload = async () => {
    if (building) return
    building = true
    try {
      await esbuild({
        entryPoints: [path.resolve('electron/preload.ts')],
        outfile: path.resolve('dist-electron/preload.cjs'),
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: ['node18'],
        sourcemap: true,
        logLevel: 'silent',
        external: ['electron']
      })
    } finally {
      building = false
    }
  }

  return {
    name: 'electron-preload-cjs',
    async configureServer(server) {
      await buildPreload()
      server.watcher.add(path.resolve('electron/preload.ts'))
      server.watcher.on('change', async (file) => {
        if (file.endsWith(`${path.sep}electron${path.sep}preload.ts`)) {
          await buildPreload()
        }
      })
    },
    async closeBundle() {
      await buildPreload()
    }
  }
}

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    electronPreloadCjs(),
    electron([
      {
        entry: 'electron/main.ts',
        // We launch Electron via the script (wait-on && electron .).
        // Prevent vite-plugin-electron from spawning a second Electron instance.
        onstart() {},
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'es'
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist'
  }
})
