// 手机桥接插件入口（独立插件版）
//
// 与 ds-bot 内置版共用同一份 src/mobile 代码，差别只在开头：它不自己装一个 rt，
// 而是从原版 ds-bot 暴露的运行时对象上取 rt（由 scripts/patch-dsbot.mjs 打的补丁提供）。
import { install as installMobile } from './src/mobile/index.js'

export const name = 'ds-bot-mobile-bridge'
// 原版 ds-bot 先激活；这里只等它的 fetch 通道就绪，再读它挂出来的 rt。
export const inject = ['connection']

const RUNTIME = Symbol.for('ds-bot.runtime')
const WAIT_MS = 15_000
const say = text => process.stderr.write(`[mobile-bridge] ${text}\n`)

export function apply(ctx, config = {}) {
  ctx.effect(() => {
    let disposed = false
    waitForRuntime().then(rt => {
      if (disposed) return
      if (rt === undefined) {
        say('没有找到 ds-bot 运行时：补丁没打，或原版没启动。手机连接不可用。')
        return
      }
      if (typeof rt.teamCall !== 'function') {
        say('运行时缺少 teamCall：补丁只打了一半，手机连接不可用。')
      }
      const merged = { ...rt, config: { ...rt.config, mobile: { ...rt.config?.mobile, ...config.mobile } } }
      try {
        installMobile(merged)
        say('已挂上 ds-bot 运行时，手机连接模块已安装')
      } catch (error) {
        say(`安装失败：${error.message}`)
      }
    }).catch(error => say(`等待运行时出错：${error.message}`))
    return () => { disposed = true }
  }, 'ds-bot-mobile-bridge: mount')
}

/** 等原版 ds-bot 激活并挂上 rt；超时就返回 undefined，由人看日志。 */
function waitForRuntime() {
  return new Promise(resolve => {
    const started = Date.now()
    const timer = setInterval(() => {
      const rt = globalThis[RUNTIME]
      if (rt !== undefined && rt.load !== undefined) {
        clearInterval(timer)
        // installMobile 的启动流程会 await rt.load()，等它把状态读进来再继续。
        resolve(rt)
        return
      }
      if (Date.now() - started > WAIT_MS) { clearInterval(timer); resolve(undefined) }
    }, 100)
    timer.unref?.()
  })
}
