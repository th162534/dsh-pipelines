import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { loadRegistry } from './registry.mjs'

/** 汇总「本机能做什么」：脚本流水线 + 专家索引（若存在）。 */
export async function buildCapabilities({ root, expertsIndex = '' } = {}) {
  const registry = await loadRegistry(root)
  const pipelines = registry.pipelines.map(p => ({
    id: p.id,
    title: p.title,
    keywords: p.when?.keywords || [],
    cost: p.cost || null,
  }))
  let experts = []
  let expertsError
  if (expertsIndex && existsSync(expertsIndex)) {
    try {
      const doc = JSON.parse(await readFile(expertsIndex, 'utf8'))
      const list = Array.isArray(doc) ? doc : doc.experts || []
      experts = list.map(item => ({ id: String(item.id), owns: String(item.owns || item.duty || '') }))
    } catch (error) {
      expertsError = error.message
    }
  }
  return { pipelines, experts, expertsError, errors: registry.errors }
}

export function capabilitiesText(cap) {
  const lines = ['可用脚本流水线（确定性任务，不耗对话 token）:']
  if (!cap.pipelines.length) lines.push('- （无）')
  for (const p of cap.pipelines) {
    const keywords = p.keywords.length ? p.keywords.join('/') : '-'
    lines.push(`- ${p.id}: ${p.title}｜触发 ${keywords}｜${p.cost || '-'}`)
  }
  if (cap.experts.length) {
    lines.push('可用专家（需要判断时）:')
    for (const e of cap.experts) lines.push(`- ${e.id}: ${e.owns}`)
  }
  return lines.join('\n')
}
