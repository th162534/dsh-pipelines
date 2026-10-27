import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const sha = value => createHash('sha256').update(value).digest('hex').slice(0, 16)

function defaultsOf(spec = {}) {
  const out = {}
  for (const [key, field] of Object.entries(spec)) if (field && typeof field === 'object' && 'default' in field) out[key] = field.default
  return out
}

function newRunId(id) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  return `${stamp}-${id}-${Math.random().toString(36).slice(2, 6)}`
}

function insideRunDir(runDir, rel) {
  const target = resolve(runDir, rel)
  return target === runDir || target.startsWith(runDir + sep) ? target : null
}

function executeStep(pipelineDir, step, env, timeoutMs) {
  return new Promise((done) => {
    const started = Date.now()
    const command = step.run === 'node' ? process.execPath : step.run
    const args = (step.args || []).map(String)
    let settled = false
    const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); done(value) } }
    const child = spawn(command, args, { cwd: pipelineDir, windowsHide: true, env: { ...process.env, ...env } })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
      finish({ ok: false, timedOut: true, stderr: `步骤超时（${timeoutMs}ms）`, ms: Date.now() - started })
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString('utf8')).slice(0, 200000) })
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-8000) })
    child.on('error', (error) => finish({ ok: false, error: error.message, ms: Date.now() - started }))
    child.on('close', (code) => finish({ ok: code === 0, code, stdout, stderr, ms: Date.now() - started }))
  })
}

export function listPipelines(registry) {
  return registry.pipelines.map(p => ({
    id: p.id,
    title: p.title,
    keywords: p.when?.keywords || [],
    cost: p.cost || null,
    inputs: Object.keys(p.inputs || {}),
    steps: p.steps.map(s => s.id),
  }))
}

export async function runPipeline(registry, id, inputs = {}, options = {}) {
  const pipeline = registry.pipelines.find(p => p.id === id)
  if (!pipeline) {
    const known = registry.pipelines.map(p => p.id).join(', ') || '(空)'
    throw new Error(`未知流水线: ${id}；可用: ${known}`)
  }
  const runsRoot = options.runs || join(process.env.DSH_HOME || homedir(), '.dsh', 'runs')
  const runId = newRunId(pipeline.id)
  const runDir = join(runsRoot, runId)
  const artifactsDir = join(runDir, 'artifacts')
  await mkdir(artifactsDir, { recursive: true })

  const merged = { ...defaultsOf(pipeline.inputs), ...inputs }
  for (const [key, field] of Object.entries(pipeline.inputs || {})) {
    if (field?.required && (merged[key] === undefined || merged[key] === '')) throw new Error(`缺少必填输入: ${key}`)
  }
  const inputHash = sha(JSON.stringify({ id: pipeline.id, inputs: merged }))
  const record = {
    runId, pipeline: pipeline.id, title: pipeline.title,
    createdAt: new Date().toISOString(), inputs: merged, inputHash,
    status: 'running', steps: [], artifacts: [],
  }
  const save = () => writeFile(join(runDir, 'run.json'), JSON.stringify(record, null, 2), 'utf8')

  const env = {
    PIPELINE_ID: pipeline.id,
    PIPELINE_RUN_ID: runId,
    PIPELINE_RUN_DIR: runDir,
    PIPELINE_ARTIFACTS: artifactsDir,
    PIPELINE_INPUTS: JSON.stringify(merged),
  }

  const maxSteps = options.maxSteps || 20
  try {
    for (const step of pipeline.steps.slice(0, maxSteps)) {
      const timeoutMs = Number(step.timeout) || 300000
      const stepRecord = { id: step.id, status: 'running', startedAt: new Date().toISOString() }
      record.steps.push(stepRecord)
      const result = await executeStep(pipeline.dir, step, env, timeoutMs)
      stepRecord.ms = result.ms
      if (!result.ok) {
        stepRecord.status = 'failed'
        stepRecord.error = result.timedOut ? 'timeout' : (result.error || `exit ${result.code}`)
        stepRecord.stderr = (result.stderr || '').slice(-2000)
        record.status = 'failed'
        await save()
        return summarize(record, runDir)
      }
      stepRecord.status = 'done'
      stepRecord.stdoutTail = (result.stdout || '').slice(-2000)
      if (step.out) {
        const target = insideRunDir(runDir, step.out)
        if (!target) throw new Error(`步骤 ${step.id} 的 out 越界: ${step.out}`)
        if (!existsSync(target)) throw new Error(`步骤 ${step.id} 未生成声明的产物: ${step.out}`)
        record.artifacts.push(step.out)
      }
      await save()
    }
    if (pipeline.verify?.file) {
      const target = insideRunDir(runDir, pipeline.verify.file)
      if (!target || !existsSync(target)) {
        record.status = 'failed'
        record.error = `验收失败：缺少 ${pipeline.verify.file}`
        await save()
        return summarize(record, runDir)
      }
    }
    record.status = 'done'
    await save()
    return summarize(record, runDir)
  } catch (error) {
    record.status = 'failed'
    record.error = error.message
    await save()
    return summarize(record, runDir)
  }
}

function summarize(record, runDir) {
  return {
    runId: record.runId,
    pipeline: record.pipeline,
    status: record.status,
    error: record.error,
    steps: record.steps.map(s => ({ id: s.id, status: s.status, ms: s.ms })),
    artifacts: record.artifacts.map(name => join(runDir, name)),
    runDir,
  }
}
