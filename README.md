# ds-bot-mobile-bridge

A separate [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that pairs the **DS Bot iOS app** with a DS Bot host that is already running. It does not replace `ds-bot`: it mounts beside it.

> 中文说明见 [README.zh.md](README.zh.md)。

## What it does

| Piece | Where | Purpose |
|---|---|---|
| Mobile API | `127.0.0.1:8788` | Serves `/mobile/v1/*` and the `/mobile/v1/events` WebSocket for the iOS app |
| Admin page | `127.0.0.1:8789/?t=<token>` | Generate a pairing code, approve a phone, revoke a device |
| Patch tool | `scripts/patch-dsbot.mjs` | Adds two one-line hooks to `ds-bot@0.1.7` so the plugin can read the Bot team runtime |

## Install

See [README.zh.md](README.zh.md) for the full walkthrough, including the two network routes (Tailscale or a separate Cloudflare subdomain) and what happens when the upstream `ds-bot` is upgraded.

```sh
# 1. into your DSH web profile
cd ~/.dsh/profiles/web
npm install ds-bot-mobile-bridge-0.1.0.tgz

# 2. add the two one-line hooks to the upstream ds-bot (idempotent)
node node_modules/ds-bot-mobile-bridge/scripts/patch-dsbot.mjs apply node_modules/ds-bot

# 3. load the plugin (cordis patch; do not overwrite the existing `- id: bot` entry)
```

```yaml
- insert:
    - id: bot-mobile-bridge
      name: ds-bot-mobile-bridge
      config:
        mobile:
          enabled: true
          host: 127.0.0.1
          port: 8788
          publicUrl: https://<address the phone can reach>
```

## Development

```sh
npm install                                  # qrcode + ws
DS_BOT_UPSTREAM=/path/to/unpatched/ds-bot npm test
npm pack                                     # ds-bot-mobile-bridge-0.1.0.tgz
```

The test suite covers the patch tool: applying twice is a no-op, a changed anchor is reported instead of written, and reverting restores the original files.

## Security notes

- The mobile API binds to `127.0.0.1` by default. Publish it only through a route you control (Tailscale or a dedicated subdomain). Do **not** put it behind a login wall: the app cannot complete a browser login.
- The admin page binds to `127.0.0.1:8789`, checks the peer is loopback, and requires a random token printed at startup. Never expose it through Cloudflare.
- The phone's bearer tokens and pairing codes are hashed at rest; the patch tool contains no keys.

## License

[Apache-2.0](LICENSE), the same license as DS Bot. This is an independent community project and is not affiliated with or endorsed by DeepSeek.
