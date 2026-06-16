import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
let commit = 'unknown'
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()
} catch {
  /* no git */
}

const versionInfo = {
  version: pkg.version,
  buildTime: new Date().toISOString(),
  commit,
}

const json = JSON.stringify(versionInfo, null, 2)

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(join(root, 'public/version.json'), json)

mkdirSync(join(root, 'dist'), { recursive: true })
writeFileSync(join(root, 'dist/version.json'), json)

console.log('version.json written:', versionInfo)
