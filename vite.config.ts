import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

let commit = 'local'
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  /* ignore */
}

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commit),
  },
})
