---
name: feishu-pps-privacy
version: 0.3.1
description: >-
  Enforces PPS (Privacy Protection System) for OpenClaw Feishu/Lark sessions—classifies
  group vs owner-DM vs non-owner-DM, applies strict vs permissive policies, coordinates
  owner notifications and time-range audit reports. Use when the channel is feishu,
  when privacy/safety policy matters, or when the user mentions PPS、飞书、群聊/单聊、脱敏、隐私保护.
---

# Feishu PPS（个人隐私保护）

## 技能文件位置（OpenClaw 约定）

本仓库按 [OpenClaw Creating Skills](https://docs.openclaw.ai/tools/creating-skills) 放置为 **`skills/feishu-pps-privacy/SKILL.md`**。加载优先级与路径见 [Skills](https://docs.openclaw.ai/tools/skills)：常见为 **工作区** `<workspace>/skills/`（最高）、**本机共享** `~/.openclaw/skills/`、或配置 `skills.load.extraDirs`。将本仓库作为 agent workspace 使用，或把 `skills/feishu-pps-privacy/` 同步到上述目录之一后，执行 `/new` 或重启 Gateway，并用 `openclaw skills list` 验证。

## 场景判定（每次会话 / 每条入站）

在 **飞书** 通道下，结合 OpenClaw 消息上下文（参见 [Feishu 文档](https://docs.openclaw.ai/channels/feishu) 与 Agent Loop 中的 `message_received` / `message:preprocessed` 载荷）判定 **PPS 场景**：

| 条件 | 场景代码 | 策略档位 |
|------|----------|----------|
| `isGroup === true` 或群聊 `chat_id`（`oc_`） | `GROUP` | **严格** |
| 单聊且发送方 `open_id` 等于配置的 **主人 open_id** | `OWNER_DM` | **宽松** |
| 单聊且发送方不是主人 | `NON_OWNER_DM` | **严格**（与群聊一致） |

**主人身份**：在插件配置中提供 `ownerOpenId`（飞书 `ou_xxx`），与载荷中的 `senderId` / `from` 比对（以 OpenClaw 当前字段为准）。

若无法判定（字段缺失），按 **严格** 处理。

## 严格策略（`GROUP` / `NON_OWNER_DM`）

默认 **最严**：

1. **执行类**：涉及智能体宿主机 **命令执行**、**代码生成并运行**、**任意 shell/终端**、**远程执行**，一律 **拒绝执行**（不调用工具；若已进入工具层则拦截并返回拒绝结果）。
2. **数据与内容**：**PII**（证件号、银行卡、手机号、精确地址等）、**私人文档**、**疑似企业项目或经营信息**（未公开商业计划、内部财务、客户名单等），默认 **打码或拒绝**；禁止在回复中复述可识别原文。
3. **脱敏**：向模型与持久化 transcript 提交的文本须先脱敏（掩码、替换 token）；**禁止**把原始敏感片段写入日志或 owner 通知。

## 宽松策略（`OWNER_DM`）

默认 **最宽**：

- 仅当请求涉及 **明显有害的系统级操作** 时 **阻止**：例如删除全部用户文件、格式化磁盘、清空关键系统目录、对宿主机执行破坏性批量 `rm`/`mkfs` 等（按工具名与参数启发式判断）。
- 其余操作允许（仍遵守当地法律与平台规范）。

## OpenClaw Plugin SDK 挂载点（与最新文档对齐）

使用 `definePluginEntry`（`openclaw/plugin-sdk/plugin-entry`）注册 **hook-only** 插件，在 `register(api)` 中用 **`api.on(hookName, handler)`**（见 `OpenClawPluginApi`）组合：

| 挂载点 | 作用 |
|--------|------|
| `inbound_claim` | 读取 `channelId`、`isGroup`、`senderId`，写入审计（分类）；可与会话路由对齐。 |
| `before_prompt_build` | 按场景缓存 `sessionKey` 的启发式场景（如 session key 中含 `oc_` / `ou_`）。 |
| `before_tool_call` | 按场景允许/拒绝工具；严格场景拦截 shell/exec/代码运行类工具；宽松场景仅拦截破坏性系统命令；返回 `block` + `blockReason`（≤200 字且含固定尾句）。 |
| `tool_result_persist` | （可选）严格场景对工具结果同步脱敏后再写入 transcript。 |

权威列表见 [Agent Loop](https://docs.openclaw.ai/concepts/agent-loop) 与 [Plugin types](https://docs.openclaw.ai/plugins/architecture)（`PluginHookName`）。

## 插件安装（Gateway）

本仓库提供参考实现目录 `openclaw-pps-plugin/`（`definePluginEntry` + `api.on`）。

### 路径无关（推荐）

安装 **不应** 写死绝对路径；任选其一即可：

1. **发布为 npm / ClawHub 包**（生产推荐）  
   安装时使用包名，与克隆目录无关：  
   `openclaw plugins install @你的作用域/openclaw-pps`  
   （以 OpenClaw 当前 `plugins install` 支持的 spec 为准，参见官方文档。）

2. **仓库内脚本（开发/内网）**  
   在 **本仓库根目录** 执行（脚本用自身位置解析 `openclaw-pps-plugin/`，与当前工作目录、磁盘挂载路径无关）：

   ```bash
   chmod +x scripts/install-openclaw-pps-plugin.sh
   ./scripts/install-openclaw-pps-plugin.sh
   ```

3. **环境变量覆盖**  
   若插件目录不在默认相对位置，可指定：  
   `OPENCLAW_PPS_PLUGIN_DIR=/path/to/openclaw-pps-plugin ./scripts/install-openclaw-pps-plugin.sh`

4. **智能体执行安装时的锚点**  
   若不用脚本，应先在 **本仓库根**（与 `skills/`、`openclaw-pps-plugin/` 同级）解析路径，例如：  
   `REPO="$(git rev-parse --show-toplevel 2>/dev/null)"`，再执行：  
   `(cd "$REPO/openclaw-pps-plugin" && npm install && npm run build) && openclaw plugins install "$REPO/openclaw-pps-plugin"`  
   **禁止**在话术或步骤中假设固定路径如 `/Users/.../private_skill`。

### 传统示例（仅作对照，避免写死路径）

```bash
cd <仓库根>/openclaw-pps-plugin && npm install && npm run build
openclaw plugins install <仓库根>/openclaw-pps-plugin
```

在 `~/.openclaw/openclaw.json` 的 `plugins.entries` 中配置，例如：

```json5
plugins: {
  entries: {
    "openclaw-pps": {
      enabled: true,
      config: {
        ownerOpenId: "ou_xxxxxxxx",
        notifyOwnerOnBlock: true,
      },
    },
  },
},
```

## 主动通知主人（严格场景触发）

当在 **群聊** 或 **非主人单聊** 中发生 **拦截**、**打码** 或 **高风险尝试**（含被拒绝的工具调用）：

1. 向 **主人单聊会话** 发送一条 **不含原始敏感内容** 的摘要（场景类型、动作类型、风险等级、时间戳）。
2. 实现方式：通过 `api.runtime` 与 Feishu 通道发送能力（或项目内已有的 gateway 方法）向 `ownerOpenId` 对应的 peer 投递；具体 API 以当前 OpenClaw 版本中 `registerGatewayMethod` / 通道 outbound 为准。

## 报告（按时间段）

提供 **CLI**（`registerCli`）或 **Gateway 方法**（`registerGatewayMethod`），例如：

- `pps-report --channel feishu --since <iso> --until <iso>`  
汇总该时间窗口内 **`GROUP` + `NON_OWNER_DM`** 的审计记录：拦截次数、类型分布、是否已通知主人；**不**包含用户原文。

审计持久化：使用 `api.runtime.state.resolveStateDir()` 下插件目录中的 append-only JSONL（或 SQLite），字段含 `ts`、`scenario`、`action`、`toolName?`、`severity`，**不含** PII 原文。

## 统一话术（强制）

**所有** 拦截、拒绝、打码说明、以及正常合规回复的 **末尾**，追加固定一句：

`您的信息在PPS系统保护之下。隐私安全、安心养虾。`

并追加会话隐私状态 emoji：

- 正常会话（无需拦截）在末尾追加 `✅`
- 拦截会话在末尾追加 `❌`

对 **被拦截** 的说明：在固定句 **之前** 用 **简短** 文字说明原因与建议（如「建议改用私聊主人账号处理」「请勿在群内执行命令」），**不得**引用或暗示原始敏感内容；**整段（含固定句与 `❌`）≤ 200 字**。

## 智能体自检清单（无插件时代码路径）

若当前环境 **未加载** PPS 插件，仍须在对话中遵守上表策略与话术；工具调用前自行分类场景并应用相同规则。
