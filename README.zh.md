# 手机连接插件（ds-bot-mobile-bridge）安装说明

[返回 iOS 总清单](https://github.com/QingJ01/DS-Bot-App/blob/main/docs/ios-ipa-steps.zh.md) · [网络接入说明](#网络接入) · [给用户看的升级说明](#原版升级后会发生什么)

这个插件让手机 App 连上你电脑上正在运行的 DS Bot（原版 0.1.7），**不用替换原版**。装上后插件会起一个**本机管理页**，地址是 http://127.0.0.1:8789/?t=<令牌> ，在 DS Bot 启动日志里能看到。在那里生成配对二维码、批准手机、撤销设备。

---

## 一、安装前你需要知道的三件事

1. **原版要打一个小补丁。** 原版不把内部状态交给外部，插件读不到 Bot 团队。补丁只改 2 行，由一个脚本自动完成，可以一键回滚。详见「原版升级后会发生什么」。
2. **手机要能访问到电脑。** 这台电脑在公网后面，需要开一条通路。两条路任选一条，见「网络接入」。
3. **不要用命令行也能装。** 下面「方式 A」是在 DS Bot 界面里点选安装，「方式 B」才是命令行。

---

## 二、安装（方式 A：在 DS Bot 界面里点）

1. 打开 DS Bot 网页版。
2. 左侧点 **插件**（Plugins）。
3. 点 **添加插件**（Add plugin）。
4. 填插件包地址：`ds-bot-mobile-bridge-0.1.0.tgz` 的完整路径，或你发布后的 npm 包名 `ds-bot-mobile-bridge`。
5. 点 **安装**，等进度走完。
6. 重启 DS Bot 后，启动日志出现一行 `[mobile-bridge] 管理页已启动：http://127.0.0.1:8789/?t=…`，说明插件装上了。

## 三、安装（方式 B：命令行，给维护者用）

```sh
# 1) 在 profile 目录里装插件
cd ~/.dsh/profiles/web
npm install /path/to/ds-bot-mobile-bridge-0.1.0.tgz

# 2) 给原版 ds-bot 打补丁（幂等，可重复跑）
node node_modules/ds-bot-mobile-bridge/scripts/patch-dsbot.mjs apply node_modules/ds-bot

# 3) 在 profile 的 cordis.patch.yml 里加下面这一段
```

```yaml
- insert:
    - id: bot-mobile-bridge
      name: ds-bot-mobile-bridge
      config:
        mobile:
          enabled: true
          publicUrl: https://<手机访问用的网址>
          port: 8788
          host: 127.0.0.1
```

## 四、第一次配对

### 第 1 步：打开管理页

管理页只监听本机（`127.0.0.1:8789`），外面访问不到。两种打开方式，**推荐方式 A**。

**方式 A：SSH 端口转发（推荐，不用装任何东西）**

1. 在你的 Mac 上打开「终端」。
2. 执行下面这一行（把 `用户名` 和 `机器地址` 换成你的）：

   ```sh
   ssh -L 8789:127.0.0.1:8789 用户名@机器地址
   ```

3. 保持这个终端窗口开着。
4. 在 DS Bot 启动日志里找到 `http://127.0.0.1:8789/?t=…` 这一整条地址，复制。
5. 在 Mac 浏览器里打开这条地址。

**方式 B：Tailscale 网内直接访问（访问设备也装了 Tailscale 时可用）**

1. 在那台机器上执行一次：

   ```sh
   tailscale serve --bg --https=8789 http://127.0.0.1:8789
   ```

2. `tailscale serve status` 会给出 `https://<机器名>.<tailnet>.ts.net`。
3. 拼成 `https://<机器名>.<tailnet>.ts.net/?t=<令牌>` 在浏览器打开。

> 不要让 Cloudflare 暴露 8789。

### 第 2 步：生成配对码

点 **生成配对码**，页面显示二维码和一段 JSON（`url`、`code`、`serverId`）。

### 第 3 步：手机扫码并批准

1. 手机打开 DS Bot App → **连接电脑** → 扫描二维码（或粘贴 JSON）。
2. 手机显示「等待电脑批准」。
3. 管理页 **待批准** 列表每 3 秒自动刷新，几秒内出现这台手机。
4. 点 **批准**，手机进入会话列表，能看到你的 Bot 团队。
5. 断开某台手机：在 **已配对设备** 里点 **撤销**。

## 五、卸载

```sh
# 1) 回滚补丁
node node_modules/ds-bot-mobile-bridge/scripts/patch-dsbot.mjs revert node_modules/ds-bot
# 2) 从 cordis.patch.yml 删掉 bot-mobile-bridge 那一段
# 3) 卸载插件
npm uninstall ds-bot-mobile-bridge
```

或者在 DS Bot 的 **插件** 页找到 `bot-mobile-bridge`，点 **移除**。原版 ds-bot 本身不受影响。

---

## 原版升级后会发生什么

> 你更新原版 DS Bot 后，手机连接需要的两处小改动会被更新覆盖掉，因为更新会替换这两个文件。
>
> **正常情况下：** 启动 DS Bot 前，插件会先跑一次补丁脚本，自动把这两处改回去。这一步只要不到一秒，你感觉不到差别。
>
> **出问题的情况：** 如果原版把这两段代码的写法改了，补丁找不到位置。这时脚本**不会乱改**，而是直接停手，并在日志里写一行 `✗`。手机 App 的「连接电脑」会显示「不可用」，不会出现“看着能用、消息发不出去”的情况。
>
> **怎么处理：** 把日志里带 `✗` 的那一行发给维护者，等插件更新后再打补丁。你的电脑端网页和 Bot 聊天完全不受影响。

自动化的建议做法：把补丁检查放进启动脚本，例如

```sh
node ~/.dsh/profiles/web/node_modules/ds-bot-mobile-bridge/scripts/patch-dsbot.mjs apply \
     ~/.dsh/profiles/web/node_modules/ds-bot
```

已经打过补丁时会输出 `already-patched`，不会重复插入；打不上时退出码为 1，启动脚本里可以据此提示用户。

---

## 网络接入

手机需要访问电脑上的 8788 端口，并且必须是 HTTPS。两条路任选一条。

### 路线 1：Tailscale（推荐，不用碰 Cloudflare）

**电脑上（维护者做一次）**

1. 打开 Tailscale 管理后台 `https://login.tailscale.com/admin`。
2. 左侧 **DNS**，确认 **MagicDNS** 已开启。
3. 同一页找到 **HTTPS Certificates**，点 **Enable HTTPS**。
4. 在电脑上执行：`tailscale serve --bg 8788`
5. 执行 `tailscale serve status`，会看到 `https://<机器名>.<tailnet>.ts.net/` 指向 `http://127.0.0.1:8788`。
6. 插件配置里 `publicUrl` 填这个 `https://…ts.net` 网址。

**手机上（你做一次）**

1. 应用商店搜索 **Tailscale**，安装。
2. 打开 App，用**和电脑同一个账号**登录。
3. 顶部开关打开；保持它常驻后台。
4. 按上面「第一次配对」打开管理页，生成配对码，手机扫码。

**注意**：手机没开 Tailscale 时连不上，这是正常的（这条通路只在你自己的设备之间）。

### 路线 2：Cloudflare 新子域名（备用）

需要你在 Cloudflare 网页上点 4 步。

1. **加 DNS 记录**：打开 `https://dash.cloudflare.com` → 点域名 `wangdada8208.xyz` → 左侧 **DNS** → **Add record** → 类型 `CNAME`、Name 填 `bot`、Target 填 `<隧道ID>.cfargotunnel.com`、橙色云保持打开 → **Save**。
2. **加隧道入口**：左侧 **Zero Trust** → **Networks** → **Tunnels** → 找到正在跑的隧道点 **Edit** → **Public Hostname** 标签 → **Add a public hostname** → Subdomain 填 `bot`，Domain 选 `wangdada8208.xyz`，Service 选 `HTTP`，URL 填 `127.0.0.1:8788` → **Save**。
3. **确认没被 Access 拦住**：**Zero Trust** → **Access** → **Applications**，检查有没有规则覆盖 `bot.wangdada8208.xyz`；如果有，把它排除，或改成只对 `dsh.wangdada8208.xyz` 生效。
4. **验证**：浏览器打开 `https://bot.wangdada8208.xyz/mobile/v1/info`，看到一段 JSON（含 `"protocolVersion":1`）就成功了；看到登录页说明第 3 步没做完。

然后把插件配置里的 `publicUrl` 改成 `https://bot.wangdada8208.xyz`，重启 DS Bot。

---

## 维护者备忘

- 依赖：`qrcode@1.5.4`、`ws@8.21.0`，装插件时一起装。
- 打包：`npm pack` 生成 `ds-bot-mobile-bridge-0.1.0.tgz`。
- 自测：`DS_BOT_UPSTREAM=/path/to/unpatched/ds-bot npm test`。
- 补丁状态：`scripts/patch-status.json`，保留最近 50 次结果。
- 端口：默认 `127.0.0.1:8788`；明文只能绑本机，对外必须走 HTTPS 反向代理（Tailscale serve 或 Cloudflare Tunnel）。
