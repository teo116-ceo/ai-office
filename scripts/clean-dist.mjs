import fs from 'node:fs/promises'
import path from 'node:path'

const DIST_DIR = path.join(process.cwd(), 'dist')

await fs.rm(DIST_DIR, { recursive: true, force: true })
console.log(`[clean-dist] removed ${DIST_DIR}`)
