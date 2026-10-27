import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function validate(pipeline, dirName) {
  const errors = []
  if (!pipeline || typeof pipeline !== 'object') return ['不是对象']
  if (typeof pipeline.id !== 'string' || !pipeline.id) errors.push('缺少 id')
  else if (pipeline.id !== dirName) errors.push(`id 与目录名不一致: ${pipeline.id} != ${dirName}`)
  if (typeof pipeline.title !== 'string' || !pipeline.title) errors.push('缺少 title')
  if (!Array.isArray(pipeline.steps) || pipeline.steps.length === 0) errors.push('steps 为空')
  else {
    const seen = new Set()
    for (const [i, step] of pipeline.steps.entries()) {
      if (!step || typeof step !== 'object') { errors.push(`steps[${i}] 不是对象`); continue }
      if (typeof step.id !== 'string' || !step.id) errors.push(`steps[${i}] 缺少 id`)
      else if (seen.has(step.id)) errors.push(`steps[${i}] id 重复: ${step.id}`)
      else seen.add(step.id)
      if (typeof step.run !== 'string' || !step.run) errors.push(`steps[${i}] 缺少 run`)
    }
  }
  return errors
}

export async function loadRegistry(root) {
  const registry = { root, pipelines: [], errors: [] }
  if (!existsSync(root)) {
    registry.errors.push({ id: '(root)', error: `目录不存在: ${root}` })
    return registry
  }
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const file = join(dir, 'pipeline.json')
    if (!existsSync(file)) continue
    try {
      const pipeline = JSON.parse(await readFile(file, 'utf8'))
      const errors = validate(pipeline, entry.name)
      if (errors.length) registry.errors.push({ id: entry.name, errors })
      else registry.pipelines.push({ ...pipeline, dir })
    } catch (error) {
      registry.errors.push({ id: entry.name, error: error.message })
    }
  }
  registry.pipelines.sort((a, b) => a.id.localeCompare(b.id))
  return registry
}

export function summaryText(registry) {
  const lines = registry.pipelines.map(p => {
    const keywords = p.when?.keywords?.join('/') || '-'
    const cost = p.cost || '-'
    return `- ${p.id} ${p.title}｜触发: ${keywords}｜耗时: ${cost}`
  })
  if (registry.errors.length) lines.push(`（${registry.errors.length} 条定义有误，用 pipeline_list 查看）`)
  return lines.join('\n') || '(没有可用流水线)'
}
