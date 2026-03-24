# Changelog

All notable changes to this project are documented in this file.

## [0.3.2] - 2026-03-25

### Added
- **`scripts/publish-clawhub.sh`**：ClawHub / npm registry 发布脚本（默认 dry-run，`--publish` 才真正 `npm publish`）；支持 `CLAWHUB_REGISTRY`、`CLAWHUB_TOKEN`、`--tag`。
- **`prepack`**：`openclaw-pps-plugin/package.json` 中 `rm -rf dist && npm run build`，避免 `npm pack` / `npm publish` 打进陈旧 `dist` 产物。

### Fixed
- **发布包入口**：`openclaw.extensions` 由 `./index.ts` 改为 **`./dist/index.js`**，与 `files` 字段一致；从 registry 安装后不再引用 tarball 中不存在的 `index.ts`。

### Changed
- **npm 包名**：`@senmud/openclaw-pps`（插件 id 仍为 `openclaw-pps`，与 `plugins.entries` 一致）。
- **文档**：`README.md`、`SKILL.md` 中生产安装示例与 ClawHub 发布说明；`publish-clawhub.sh` 在 build 前清理 `dist`。

### Changed (metadata)
- 插件与技能 frontmatter 版本号更新为 **0.3.2**。

## [0.3.1] - 2026-03-24

### Fixed
- **`message_sending` 拦截态与飞书出站对齐**：OpenClaw 在 `applyMessageSendingHook` 中不向 `metadata` 传入 `runId`，无法再用 `runId` 关联拦截。改为用 `sessionKey` 解析 peer（`oc_` / `ou_` 等）并与出站 `to` 匹配；无 peer 段时（如 main DM scope）对 `feishu`/`lark` 做 FIFO 回退。
- **未拦截回复末尾 ✅**：`message_sending` 合并规则为后执行者优先（`next.content ?? acc?.content`）。为本插件注册 **`priority: -10_000`**，保证最后执行，避免被其他插件覆盖正文从而丢失状态 emoji。
- **`lark` / `feishu` 一致化**：出站侧常规范为 `feishu`；pending 与 `consumePendingBlockForOutbound` 统一用 `normalizeFeishuChannelId`（`lark` → `feishu`）比较。

### Changed
- 扩展单测：`extractFeishuPeerIdFromSessionKey`、`consumePendingBlockForOutbound`、`normalizeFeishuChannelId`。
- 插件与技能元数据版本号更新为 **0.3.1**。

## [0.3.0] - 2026-03-24

### Added
- **Owner Feishu DM notifications** when a tool call is blocked in strict scenarios (`GROUP` / `NON_OWNER_DM`): uses `channels.feishu` app credentials from `openclaw.json`, obtains `tenant_access_token`, then calls `im/v1/messages` with `receive_id_type=open_id`.
- Plugin config `feishuNotifyAccountId` to pick which `channels.feishu.accounts` entry to use for outbound notify.
- Automated tests:
  - `tests/feishu-notify.test.ts` — credential resolution + **mocked `fetch`** functional flow
  - `tests/feishu-notify-cases.md` — case matrix

### Changed
- Plugin and skill version metadata bumped to **0.3.0**.
- Root `npm test` now runs both `pps-policy` and `feishu-notify` test files.

## [0.2.0] - 2026-03-24

### Added
- Reply protection status emoji:
  - `✅` appended to normal (non-blocked) replies
  - `❌` appended to blocked replies
- Plugin debug switch in `openclaw.plugin.json`:
  - `config.debug` (default `false`)
  - Enables verbose hook diagnostics for `before_tool_call` and `message_sending`
- Expanded automated tests for emoji behavior and blocked reply formatting.

### Changed
- Synchronized version metadata:
  - Plugin `openclaw-pps-plugin/package.json` bumped to `0.2.0`
  - Skill frontmatter (`skills/feishu-pps-privacy/SKILL.md`) includes `version: 0.2.0`
- Blocked-reply formatter now includes `❌` while preserving length limit (`<= 200` chars).

## [0.1.0] - 2026-03-24

### Added
- Initial OpenClaw PPS plugin scaffold (`openclaw-pps-plugin/`):
  - Scenario classification (`GROUP` / `OWNER_DM` / `NON_OWNER_DM`)
  - Hook wiring (`inbound_claim`, `before_prompt_build`, `before_tool_call`)
  - JSONL audit logging and `pps-report` CLI summary
- OpenClaw skill doc at `skills/feishu-pps-privacy/SKILL.md`
  following workspace skill conventions.
- Path-independent install script:
  - `scripts/install-openclaw-pps-plugin.sh`
- Root-level automated policy test suite under `tests/`:
  - executable tests (`tests/pps-policy.test.ts`)
  - case matrix documentation (`tests/pps-policy-cases.md`)

