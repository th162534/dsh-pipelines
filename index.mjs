import { join } from 'node:path'
import { homedir } from 'node:os'
import { loadRegistry } from './lib/registry.mjs'
import { listPipelines, runPipeline } from './lib/runner.mjs'

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
            cost: { type: ['string', 'null'] }, inputs: { type: 'array', items: { type: 'string' } }, steps: { type: 'array', items: { type: 'string' } },
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

export function apply(ctx, config = {}) {
  const root = config.root || join(homedir(), '.dsh', 'pipelines')
  const runs = config.runs || join(homedir(), '.dsh', 'runs')
  const maxSteps = Math.max(1, Math.min(50, Number(config.maxSteps) || 20))

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

}

