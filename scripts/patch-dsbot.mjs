#!/usr/bin/env node
// 给 ds-bot 打上手机桥接需要的 2 处补丁。
//
// 用法：
//   node patch-dsbot.mjs apply   <ds-bot 目录>   打补丁（幂等，已打过就跳过）
//   node patch-dsbot.mjs check   <ds-bot 目录>   只检查，不写文件
//   node patch-dsbot.mjs revert  <ds-bot 目录>   回滚
//
// 设计：每个补丁 = 锚点 + 锚点 sha256 + 插入文本。锚点必须恰好出现 1 次，
// 且 sha256 与 patches.json 一致，否则拒绝写入并报错（不猜、不乱插）。
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'patches.json'), 'utf8'))
const sha = text => createHash('sha256').update(text).digest('hex')

function log(status, record, extra = {}) {
  const entry = { at: new Date().toISOString(), status, ...record, ...extra }
  try {
    const path = join(here, 'patch-status.json')
    const history = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
    history.push(entry)
    writeFileSync(path, JSON.stringify(history.slice(-50), null, 2) + '\n')
  } catch { /* 状态文件写不了不影响主流程 */ }
  return entry
}

function checkOne(pkgDir, patch) {
  const file = join(pkgDir, patch.file)
  if (!existsSync(file)) return { ok: false, code: 'missing-file', message: `${patch.file} 不存在` }
  const source = readFileSync(file, 'utf8')
  const patched = source.includes(patch.marker)
  if (patched) return { ok: true, state: 'patched', file, source }
  const parts = source.split(patch.anchor)
  if (parts.length === 1) return { ok: false, code: 'anchor-missing', message: `${patch.id}: 在 ${patch.file} 找不到插入点（原版可能改了 ${patch.file} 的写法）` }
  if (parts.length > 2) return { ok: false, code: 'anchor-ambiguous', message: `${patch.id}: 插入点在 ${patch.file} 出现 ${parts.length - 1} 次，拒绝写入` }
  const actual = sha(patch.anchor)
  if (patch.anchorSha256 && actual !== patch.anchorSha256) {
    return { ok: false, code: 'anchor-changed', message: `${patch.id}: 插入点内容变了（期望 ${patch.anchorSha256.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…），拒绝写入` }
  }
  return { ok: true, state: 'unpatched', file, source }
}

function backup(file) {
  const copy = `${file}.mobile-bridge.bak`
  if (!existsSync(copy)) copyFileSync(file, copy)
  return copy
}

export function apply(pkgDir, { write = true } = {}) {
  const results = []
  for (const patch of manifest.patches) {
    const check = checkOne(pkgDir, patch)
    if (!check.ok) { results.push({ id: patch.id, ...check }); continue }
    if (check.state === 'patched') { results.push({ id: patch.id, ok: true, state: 'already-patched' }); continue }
    if (write) {
      backup(check.file)
      const next = check.source.replace(patch.anchor, patch.insert)
      writeFileSync(check.file, next)
      const verify = readFileSync(check.file, 'utf8').includes(patch.marker)
      results.push({ id: patch.id, ok: verify, state: verify ? 'patched' : 'verify-failed' })
    } else results.push({ id: patch.id, ok: true, state: 'would-patch' })
  }
  return results
}

export function revert(pkgDir) {
  const results = []
  for (const patch of manifest.patches) {
    const file = join(pkgDir, patch.file)
    const copy = `${file}.mobile-bridge.bak`
    if (!existsSync(copy)) { results.push({ id: patch.id, ok: true, state: 'no-backup' }); continue }
    copyFileSync(copy, file)
    results.push({ id: patch.id, ok: true, state: 'reverted' })
  }
  return results
}

export function main(argv = process.argv.slice(2)) {
  const [command = 'check', pkgDir = process.env.DS_BOT_PACKAGE] = argv
  if (pkgDir === undefined) {
    console.error('用法：node patch-dsbot.mjs <apply|check|revert> <ds-bot 目录>')
    process.exit(2)
  }
  const results = command === 'apply' ? apply(pkgDir) : command === 'revert' ? revert(pkgDir) : apply(pkgDir, { write: false })
  const failed = results.filter(r => !r.ok)
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.id}: ${r.state ?? r.code}${r.message ? ` — ${r.message}` : ''}`)
  log(failed.length ? 'failed' : 'ok', { command, pkgDir, results })
  if (failed.length) {
    console.error('\n补丁没有全部打上。手机连接会显示「不可用」。请把上面的 ✗ 行发给维护者。')
    process.exit(1)
  }
}

const isEntry = process.argv[1] !== undefined && process.argv[1].endsWith('patch-dsbot.mjs')
if (isEntry) main()
