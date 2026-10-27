#!/usr/bin/env node
/**
 * 把 dsh-pipelines 接进 DSH profile（默认只预览，不写）。
 *   node scripts/apply-profile.mjs              # 预览
 *   node scripts/apply-profile.mjs --apply      # 备份后写入（行默认 disabled）
 *   node scripts/apply-profile.mjs --apply --enable
 *   node scripts/apply-profile.mjs --revert     # 恢复最近一次备份
 */
import { copyFile, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const profile = process.env.DSH_PROFILE_DIR || 'C:/Users/ASUS/.dsh/profiles/desktop'
const pkgPath = join(profile, 'package.json')
const patchPath = join(profile, 'cordis.patch.yml')
const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const enable = args.has('--enable')
const revert = args.has('--revert')

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')

async function backup(file) {
  const target = `${file}.bak-pipelines-${stamp}`
  await copyFile(file, target)
  return target
}

async function latestBackup(prefix) {
  const dir = dirname(prefix)
  const base = prefix.split(/[\/]/).pop()
  const files = (await readdir(dir)).filter(name => name.startsWith(`${base}.bak-pipelines-`)).sort()
  return files.length ? join(dir, files[files.length - 1]) : null
}

if (revert) {
  const backups = [
    [pkgPath, await latestBackup(pkgPath)],
    [patchPath, await latestBackup(patchPath)],
  ]
  for (const [target, source] of backups) {
    if (!source) { console.log(`跳过 ${target}：没有备份`); continue }
    console.log(`${apply ? '恢复' : '将恢复'} ${source} -> ${target}`)
    if (apply) await copyFile(source, target)
  }
  if (!apply) console.log('（预览：加 --apply 执行）')
  process.exit(0)
}

if (!existsSync(pkgPath) || !existsSync(patchPath)) {
  console.error(`找不到 profile 文件：${profile}`)
  process.exit(1)
}

const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
const patch = await readFile(patchPath, 'utf8')
const depKey = 'dsh-pipelines'
const depValue = 'link:' + repo.split(String.fromCharCode(92)).join('/')
const hasDep = Boolean(pkg.dependencies?.[depKey])
const hasRow = patch.includes(`id: dsh-pipelines\r\n`) || patch.includes(`id: dsh-pipelines\n`) || /^- id: dsh-pipelines$/m.test(patch)

console.log(`profile: ${profile}`)
console.log(`依赖: ${hasDep ? pkg.dependencies[depKey] : '（未安装）'}`)
console.log(`配置行: ${hasRow ? '已存在' : '（未写入）'}`)
if (hasDep && hasRow) { console.log('无需改动。'); process.exit(0) }

if (!apply) {
  console.log('将要执行:')
  if (!hasDep) console.log(`  1) dsh plugin --profile desktop add ${depValue}`)
  if (!hasRow) console.log(`  2) 追加配置行（disabled: ${enable ? 'false' : 'true'}）`)
  console.log('（预览：加 --apply 执行）')
  process.exit(0)
}

if (!hasDep) {
  console.log(`备份 ${pkgPath}`)
  await backup(pkgPath)
  pkg.dependencies = { ...(pkg.dependencies || {}), [depKey]: depValue }
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  console.log('已写入依赖（首次启动时由 DSH 安装到 node_modules）')
}

if (!hasRow) {
  console.log(`备份 ${patchPath}`)
  await backup(patchPath)
  const block = [
    '',
    '# 本地脚本流水线（由 scripts/apply-profile.mjs 写入）',
    '- id: dsh-pipelines',
    "  name: dsh-pipelines",
    '  config:',
    `    root: ${repo.split(String.fromCharCode(92)).join('/')}/pipelines`,
    '    runs: C:/Users/ASUS/.dsh/runs',
    `  disabled: ${enable ? 'false' : 'true'}`,
    '',
  ].join('\n')
  await writeFile(patchPath, `${patch.replace(/\s*$/, '')}\n${block}`, 'utf8')
  console.log(`已追加配置行（disabled: ${enable ? 'false' : 'true'}）`)
}
console.log('完成。重启 DSH 生效。')
