import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const inputs = JSON.parse(process.env.PIPELINE_INPUTS || '{}')
const runDir = process.env.PIPELINE_RUN_DIR
const target = join(runDir, 'artifacts', 'echo.txt')
await mkdir(join(runDir, 'artifacts'), { recursive: true })
await writeFile(target, `echo: ${inputs.text}\n`, 'utf8')
console.log(JSON.stringify({ ok: true, target }))
