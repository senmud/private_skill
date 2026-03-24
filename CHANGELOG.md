# Changelog

All notable changes to this project are documented in this file.

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

