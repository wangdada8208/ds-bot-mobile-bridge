// 本机管理页面：生成配对码、批准/拒绝手机、撤销设备。
//
// 安全约定：
// - 只监听 127.0.0.1，独立端口（默认 8789）；手机接口在 8788，两者不复用。
// - 每次启动生成随机 token，页面地址是 http://127.0.0.1:8789/?t=<token>；不带 token 一律 403。
// - 回环地址校验之外再加 token，防同机其他进程误开。
import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

const PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>DS Bot · 移动设备</title>
<style>
 body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin:0;background:#fafafa;color:#111}
 main{max-width:680px;margin:0 auto;padding:24px}
 h1{font-size:20px;margin:0 0 16px} h2{font-size:16px;margin:0 0 8px}
 .card{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:16px;margin-bottom:16px}
 button{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid #d0d0d0;background:#fff;cursor:pointer}
 button.primary{background:#111;color:#fff;border-color:#111}
 button.danger{color:#b42318;border-color:#f0c4c0}
 pre{background:#f5f5f5;padding:10px;border-radius:8px;overflow:auto;font-size:12px}
 .muted{color:#666;font-size:13px} .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
 img{max-width:220px;display:block;margin:10px 0}
</style></head>
<body><main>
<h1>DS Bot · 移动设备</h1>
<div class="card" id="status"><span class="muted">加载中…</span></div>
<div class="card">
  <h2>配对手机</h2>
  <p class="muted">点下面的按钮生成配对码，用手机 App 扫描。</p>
  <button class="primary" data-act="pairing.create">生成配对码</button>
  <div id="pairing"></div>
</div>
<div class="card"><h2>待批准</h2><div id="pending" class="muted">暂无</div></div>
<div class="card"><h2>已配对设备</h2><div id="devices" class="muted">暂无</div></div>
</main>
<script>
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
async function call(endpoint, payload = {}) {
  const res = await fetch('/admin/api/' + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? body?.error ?? ('HTTP ' + res.status))
  return body
}
const el = id => document.getElementById(id)
let lastPending = ''
async function refresh() {
  const s = await call('status')
  el('status').innerHTML = '<div><strong>' + (s.enabled ? '已启用' : '未启用') + '</strong></div>' +
    '<div class="muted">对外网址：' + esc(s.url ?? '—') + '</div>' +
    '<div class="muted">已配对：' + (s.devices?.filter(d => !d.revokedAt).length ?? 0) + ' 台</div>'
  const pending = s.pending ?? []
  const key = JSON.stringify(pending.map(p => p.id))
  if (key !== lastPending) {
    lastPending = key
    el('pending').innerHTML = pending.length ? pending.map(p =>
      '<div class="row">' + esc(p.name ?? p.deviceName ?? '新设备') +
      ' <button class="primary" data-act="pairing.approve" data-id="' + esc(p.id) + '">批准</button>' +
      ' <button class="danger" data-act="pairing.deny" data-id="' + esc(p.id) + '">拒绝</button></div>').join('') : '暂无'
  }
  el('devices').innerHTML = (s.devices ?? []).length ? s.devices.map(d =>
    '<div class="row">' + esc(d.name ?? d.id) + (d.revokedAt ? ' <span class="muted">（已撤销）</span>' :
    ' <button class="danger" data-act="device.revoke" data-id="' + esc(d.id) + '">撤销</button>') + '</div>').join('') : '暂无'
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-act]')
  if (!button) return
  button.disabled = true
  try {
    if (button.dataset.act === 'pairing.create') {
      const p = await call('pairing.create')
      el('pairing').innerHTML = '<img alt="配对二维码" src="' + esc(p.qrDataUrl) + '"><pre>' +
        esc(JSON.stringify({ url: p.url, code: p.code, serverId: p.serverId }, null, 2)) + '</pre>'
    } else {
      await call(button.dataset.act, { id: button.dataset.id, requestId: button.dataset.id })
      lastPending = ''
      await refresh()
    }
  } catch (error) { alert(error.message) } finally { button.disabled = false }
})
refresh().catch(error => { el('status').textContent = '无法连接手机连接模块：' + error.message })
setInterval(() => { lastPending = ''; refresh().catch(() => {}) }, 3000)
</script>
</body></html>`

function tokenMatches(given, expected) {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * 起本机管理页。
 * @param {{ port?: number, operator: Function, log?: Function }} options
 * @returns {{ port: number, url: string, token: string, close: Function }}
 */
export function createAdminServer({ port = 8789, operator, log = () => {} }) {
  const token = randomBytes(18).toString('base64url')
  const server = createServer(async (request, response) => {
    const remote = request.socket.remoteAddress ?? ''
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    if (!LOOPBACK.has(remote)) { response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); response.end('只允许本机访问'); return }
    const url = new URL(request.url, 'http://admin.invalid')
    if (!tokenMatches(url.searchParams.get('t'), token) && !tokenMatches(request.headers['x-mobile-admin-token'], token)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); response.end('需要带令牌打开本页（见 DS Bot 启动日志）'); return
    }
    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin')) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(PAGE)
        return
      }
      if (request.method === 'POST' && url.pathname.startsWith('/admin/api/')) {
        const endpoint = url.pathname.slice('/admin/api/'.length)
        if (!['status', 'pairing.create', 'pairing.approve', 'pairing.deny', 'device.revoke'].includes(endpoint)) {
          response.writeHead(404, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'unknown endpoint' })); return
        }
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        let body = {}
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} } catch { body = {} }
        const value = await operator(endpoint, body)
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(value))
        return
      }
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('not found')
    } catch (error) {
      response.writeHead(error.status ?? 500, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: error.status ? { code: error.code, message: error.message } : { code: 'INTERNAL', message: '管理页出错' } }))
    }
  })
  const closing = new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const handle = {
    port,
    token,
    url: `http://127.0.0.1:${port}/?t=${token}`,
    ready: closing,
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve) }),
  }
  closing.then(() => log(`管理页已启动：${handle.url}`)).catch(error => log(`管理页启动失败：${error.message}`))
  return handle
}
