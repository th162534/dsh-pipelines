import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const artifacts = process.env.PIPELINE_ARTIFACTS
const raw = JSON.parse(await readFile(join(artifacts, 'evidence.raw.json'), 'utf8'))
const text = String(raw.text || '').trim()
const images = Array.isArray(raw.images) ? raw.images : []

await mkdir(artifacts, { recursive: true })
const header = [
  '# 视频证据',
  '',
  `- 图像数：${images.length}`,
  `- 文本长度：${text.length} 字`,
  `- 生成时间：${new Date().toISOString()}`,
  '',
  '## 转写与画面描述',
  '',
].join('\n')
await writeFile(join(artifacts, 'transcript.md'), `${header}${text || '（无文本）'}\n`, 'utf8')
await writeFile(join(artifacts, 'frames.json'), JSON.stringify(images.map(item => item.path), null, 2), 'utf8')
console.log(JSON.stringify({ ok: true, textLength: text.length, images: images.length }))
