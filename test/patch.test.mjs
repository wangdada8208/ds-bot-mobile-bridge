// 补丁脚本的自测：幂等、识别锚点变化、拒绝歧义、可回滚。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, revert } from '../scripts/patch-dsbot.mjs'

const upstream = process.env.DS_BOT_UPSTREAM
const skip = upstream === undefined ? 'set DS_BOT_UPSTREAM to an unpatched ds-bot checkout' : false

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-bridge-'))
  cpSync(upstream, dir, { recursive: true })
  return dir
}

test('apply is idempotent and revert restores the original', { skip }, () => {
  const dir = fixture()
  try {
    const first = apply(dir)
    assert.ok(first.every(r => r.ok && r.state === 'patched'), JSON.stringify(first))
    const second = apply(dir)
    assert.ok(second.every(r => r.ok && r.state === 'already-patched'), JSON.stringify(second))
    assert.match(readFileSync(join(dir, 'index.js'), 'utf8'), /Symbol\.for\('ds-bot\.runtime'\)/)
    revert(dir)
    assert.equal(readFileSync(join(dir, 'index.js'), 'utf8'), readFileSync(join(upstream, 'index.js'), 'utf8'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a changed anchor is reported, not inserted', { skip }, () => {
  const dir = fixture()
  try {
    const file = join(dir, 'index.js')
    writeFileSync(file, readFileSync(file, 'utf8').replace('  createRuntime(ctx, config)\n}', '  return createRuntime(ctx, config)\n}'))
    const results = apply(dir)
    const runtime = results.find(r => r.id === 'expose-runtime')
    assert.equal(runtime.ok, false)
    assert.equal(runtime.code, 'anchor-missing')
    assert.doesNotMatch(readFileSync(file, 'utf8'), /Symbol\.for\('ds-bot\.runtime'\)/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
