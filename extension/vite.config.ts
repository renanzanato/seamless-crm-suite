import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'fs'

/**
 * Plugin: copia sidebar.css para dist/ e achata popup.html pra dist/popup.html
 */
function flattenAndCopyAssets() {
  return {
    name: 'flatten-and-copy',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist')

      // 1. achata dist/src/popup/popup.html -> dist/popup.html
      const nested = resolve(distDir, 'src/popup/popup.html')
      const flat   = resolve(distDir, 'popup.html')
      if (existsSync(nested)) {
        renameSync(nested, flat)
      }
      const srcDir = resolve(distDir, 'src')
      if (existsSync(srcDir)) {
        rmSync(srcDir, { recursive: true, force: true })
      }

      // 2. copia sidebar.css
      const srcCss = resolve(__dirname, 'src/sidebar.css')
      const dstCss = resolve(distDir, 'sidebar.css')
      if (existsSync(srcCss)) {
        copyFileSync(srcCss, dstCss)
      }
    }
  }
}

export default defineConfig({
  plugins: [flattenAndCopyAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content:    resolve(__dirname, 'src/content.ts'),
        popup:      resolve(__dirname, 'src/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.html')) return '[name][extname]'
          if (info.name?.endsWith('.css'))  return '[name][extname]'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
