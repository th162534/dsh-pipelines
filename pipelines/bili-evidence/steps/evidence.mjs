import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const inputs = JSON.parse(process.env.PIPELINE_INPUTS || '{}')
const artifacts = process.env.PIPELINE_ARTIFACTS
const python = inputs.python || process.env.BILI_VISION_PYTHON || ''
const bvScript = inputs.bvScript || process.env.BILI_VISION_SCRIPT || ''
const cacheDir = inputs.cacheDir || process.env.BILI_VISION_CACHE || ''

if (!inputs.url) throw new Error('缺少必填输入 url')
if (!python) throw new Error('缺少 python 路径：在 pipeline.local.json 的 inputs.python 配置，或设置 BILI_VISION_PYTHON')
if (!bvScript) throw new Error('缺少 bvScript：在 pipeline.local.json 的 inputs.bvScript 配置（指向 bili-vision/bv.py）')

const args = [bvScript, 'inspect', String(inputs.url), '--vision-policy', String(inputs.policy || 'text'),
  '--max-frames', String(Number(inputs.maxFrames) || 24), '--frame-width', '960', '--max-text-tokens', '16000']
if (inputs.start !== undefined && inputs.start !== null && inputs.start !== '') args.push('--start', String(inputs.start))
if (inputs.end !== undefined && inputs.end !== null && inputs.end !== '') args.push('--end', String(inputs.end))

const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
if (cacheDir) env.BILI_VISION_CACHE = String(cacheDir)

const result = await new Promise((done) => {
  const child = spawn(python, args, { cwd: dirname(bvScript), windowsHide: true, env })
  let out = ''
  let err = ''
  child.stdout.on('data', chunk => { out += chunk.toString('utf8') })
  child.stderr.on('data', chunk => { err = (err + chunk.toString('utf8')).slice(-20000) })
  child.on('error', error => done({ code: -1, out, err: error.message }))
  child.on('close', code => done({ code, out, err }))
})

if (result.code !== 0) {
  console.error(result.err.slice(-4000))
  throw new Error(`bv.py inspect 失败（exit ${result.code}）`)
}

let evidence
try {
  evidence = JSON.parse(result.out.trim().split('\n').pop())
} catch (error) {
  throw new Error(`无法解析 bv.py 输出: ${error.message}`)
}

await mkdir(artifacts, { recursive: true })
await writeFile(join(artifacts, 'evidence.raw.json'), JSON.stringify(evidence, null, 2), 'utf8')
console.log(JSON.stringify({ ok: true, images: (evidence.images || []).length, textLength: String(evidence.text || '').length }))
