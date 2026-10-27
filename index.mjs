import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { loadRegistry } from './lib/registry.mjs'
import { buildCapabilities, capabilitiesText } from './lib/capabilities.mjs'
import { listPipelines, runPipeline } from './lib/runner.mjs'

// 模块被 import 即写一行日志：用来区分「插件没被加载」和「加载了但 apply 失败」
try {
  appendFileSync(join(homedir(), '.dsh', 'pipelines-load.log'), `${new Date().toISOString()} module imported\n`)
} catch {}

export const name = 'dsh-pipelines'
export const inject = ['tools']

const listOutput = {
  schema: {
    type: 'object', required: ['pipelines'], additionalProperties: false,
    properties: {
      pipelines: {
        type: 'array',
        items: {
          type: 'object', required: ['id', 'title'],
          properties: {
            id: { type: 'string' }, title: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } },
            cost: { type: 'string' }, inputs: { type: 'array', items: { type: 'string' } }, steps: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      errors: { type: 'array' },
    },
  },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2).slice(0, 8000) }],
}

const runOutput = {
  schema: {
    type: 'object', required: ['runId', 'status'], additionalProperties: false,
    properties: {
      runId: { type: 'string' }, pipeline: { type: 'string' },
      status: { type: 'string', enum: ['done', 'failed', 'running'] },
      error: { type: 'string' },
      steps: { type: 'array', items: { type: 'object' } },
      artifacts: { type: 'array', items: { type: 'string' } },
      runDir: { type: 'string' },
    },
  },
  render: (_args, value) => {
    const failed = value.error ? `｜失败: ${value.error}` : ''
    const steps = value.steps.map(s => `${s.id}=${s.status}${s.ms ? `(${s.ms}ms)` : ''}`).join(' ')
    const artifacts = value.artifacts.length ? `\n产物:\n${value.artifacts.map(p => `  ${p}`).join('\n')}` : ''
    return [{ type: 'text', text: `${value.pipeline || ''} ${value.status}${failed}\n步骤: ${steps}\n目录: ${value.runDir}${artifacts}` }]
  },
}

function loadLog(line) {
  try {
    const file = join(homedir(), '.dsh', 'pipelines-load.log')
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`)
  } catch {}
}

function applyInner(ctx, config = {}) {
  // 机器本地配置：~/.dsh/pipelines.config.json（不进仓库、不进 YAML patch）
  let local = {}
  try {
    local = JSON.parse(readFileSync(join(homedir(), '.dsh', 'pipelines.config.json'), 'utf8'))
  } catch {}
  const pick = (key, fallback) => config[key] || local[key] || fallback
  const root = pick('root', join(homedir(), '.dsh', 'pipelines'))
  const runs = pick('runs', join(homedir(), '.dsh', 'runs'))
  const maxSteps = Math.max(1, Math.min(50, Number(config.maxSteps || local.maxSteps) || 20))
  const expertsIndex = config.expertsIndex || local.expertsIndex || ''
  loadLog(`apply root=${root} runs=${runs} tools=${typeof ctx?.tools?.register}`)

  loadLog('register: capabilities')
  ctx.tools.register({
    name: 'capabilities',
    description: '列出本机可用的能力：脚本流水线（确定性任务）与专家（需要判断）。先查这里，再决定用流水线、派专家，还是自己做。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { detail: { type: 'string', enum: ['short', 'full'], default: 'short' } },
    },
    output: {
      schema: {
        type: 'object', required: ['text'], additionalProperties: false,
        properties: { text: { type: 'string' }, pipelines: { type: 'array' }, experts: { type: 'array' } },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      const cap = await buildCapabilities({ root, expertsIndex })
      const full = await (async () => {
        const registry = await loadRegistry(root)
        return registry.pipelines.map(p => ({ id: p.id, title: p.title, keywords: p.when?.keywords || [], inputs: Object.keys(p.inputs || {}) }))
      })()
      return { text: capabilitiesText(cap), pipelines: full, experts: cap.experts }
    },
  })

  loadLog('register: pipeline_list')
  ctx.tools.register({
    name: 'pipeline_list',
    description: '列出本机可用的脚本流水线：id、标题、触发关键词、输入项、步骤。流水线由独立进程执行，不消耗对话 token，只回路径与摘要。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: listOutput,
    async execute() {
      const registry = await loadRegistry(root)
      return { pipelines: listPipelines(registry), errors: registry.errors }
    },
  })

  loadLog('register: pipeline_run')
  ctx.tools.register({
    name: 'pipeline_run',
    description: '执行一条本地脚本流水线，返回 runId、每步状态与产物路径（不含产物全文）。确定性任务优先用流水线，不要再派专家。',
    parameters: {
      type: 'object', required: ['id'], additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'pipeline_list 返回的 id' },
        inputs: { type: 'object', additionalProperties: true, description: '输入项，键见 pipeline_list 的 inputs' },
      },
    },
    output: runOutput,
    timeoutMs: 30 * 60 * 1000,
    async execute(args) {
      const registry = await loadRegistry(root)
      return runPipeline(registry, String(args?.id || ''), args?.inputs || {}, { runs, maxSteps })
    },
  })
  loadLog('3 tools registered')
}

export function apply(ctx, config = {}) {
  try {
    applyInner(ctx, config)
  } catch (e) {
    loadLog(`ERROR ${e && e.stack || e}`)
    throw e
  }
}

