import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadRegistry, summaryText } from '../lib/registry.mjs'
import { listPipelines, runPipeline } from '../lib/runner.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', 'pipelines')
const registry = await loadRegistry(root)

if (registry.errors.length) {
  console.error('注册表错误:', JSON.stringify(registry.errors, null, 2))
  process.exit(1)
}
console.log('流水线:', summaryText(registry).replace(/\n/g, ' | '))

const runs = await mkdtemp(join(tmpdir(), 'dsh-pipeline-selftest-'))
try {
  const result = await runPipeline(registry, 'echo', { text: 'selftest' }, { runs })
  console.log('结果:', JSON.stringify({ status: result.status, steps: result.steps, artifacts: result.artifacts }, null, 2))
  if (result.status !== 'done') throw new Error('echo 流水线未成功')
  const content = await readFile(result.artifacts[0], 'utf8')
  if (!content.includes('selftest')) throw new Error('产物内容不正确')
  console.log('SELFTEST OK')
} finally {
  await rm(runs, { recursive: true, force: true })
}
