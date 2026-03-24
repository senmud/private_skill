# Feishu PPS（个人隐私保护）

面向 **OpenClaw + 飞书/Lark** 的 **PPS（Privacy Protection System）**：按会话区分群聊、主人单聊、非主人单聊，自动套用「严格 / 宽松」策略；Skill 按 **OpenClaw 官方目录约定** 放置，与 Gateway 插件配合。

---

## 功能亮点

- **三场景分流**：群聊（`GROUP`）、主人私聊（`OWNER_DM`）、非主人私聊（`NON_OWNER_DM`）；后两者在单聊中通过飞书 `open_id` 与配置的 `ownerOpenId` 比对。
- **默认策略差异化**：群聊与非主人单聊 **最严**（禁止宿主机命令执行、代码运行类工具；PII / 私人文档 / 疑似经营信息打码或拒绝）；主人单聊 **最宽**（仅拦截明显破坏性系统操作，如全盘删除、格式化等）。
- **OpenClaw Plugin SDK 深度集成**：使用 `definePluginEntry` 与 `api.on` 挂载 `inbound_claim`、`before_prompt_build`、`before_tool_call` 等钩子，在工具调用前执行策略（详见 [Agent Loop](https://docs.openclaw.ai/concepts/agent-loop)）。
- **审计与报告**：拦截与分类事件写入 JSONL；提供 `pps-report` 思路与 CLI 注册，可按时间段汇总 **群聊 + 非主人单聊** 行为（不含用户原文）。
- **主人侧通知（可扩展）**：严格场景下触发拦截时，可对接向主人飞书单聊推送摘要（当前实现含审计与日志占位，发消息需接入你们环境中的 Feishu outbound）。
- **统一用户体验**：拦截说明使用固定尾句「您的信息在PPS系统保护之下。隐私安全、安心养虾。」，且整段（含尾句）控制在 **200 字以内**，不回流敏感原文。
- **状态可视化**：正常返回末尾追加 `✅`，拦截返回末尾追加 `❌`，明确当前会话处于隐私保护通过/拦截状态。
- **OpenClaw Skill**：`skills/feishu-pps-privacy/SKILL.md`，符合 [Creating Skills](https://docs.openclaw.ai/tools/creating-skills) / [Skills](https://docs.openclaw.ai/tools/skills) 的加载约定。

---

## 仓库结构

| 路径 | 说明 |
|------|------|
| `skills/feishu-pps-privacy/SKILL.md` | OpenClaw Agent Skill（策略、话术、SDK 挂载说明） |
| `openclaw-pps-plugin/` | OpenClaw 原生插件（TypeScript）：钩子、审计、CLI |
| `tests/` | 策略与飞书通知测试（`pps-policy.test.ts`、`feishu-notify.test.ts` 及对应 `*-cases.md`） |
| `scripts/install-openclaw-pps-plugin.sh` | 按脚本位置解析插件目录，安装不依赖仓库绝对路径 |
| `package.json` | 根目录脚本：`npm test` 运行上述测试（依赖 `tsx`） |
| `README.md` | 本说明 |

---

## 使用说明

### 一、OpenClaw 中加载 Skill

OpenClaw 从以下来源加载技能（优先级见 [Skills](https://docs.openclaw.ai/tools/skills)）：

| 位置 | 说明 |
|------|------|
| **`<workspace>/skills/`** | 工作区技能，优先级最高；若本仓库即为 agent workspace，保留 `skills/feishu-pps-privacy/` 即可 |
| **`~/.openclaw/skills/`** | 本机共享技能 |
| **`skills.load.extraDirs`** | 配置中额外目录 |

任选其一方式：

1. 将本仓库 **整体** 指向或配置为 OpenClaw 的 **workspace**，使 `<workspace>/skills/feishu-pps-privacy/SKILL.md` 生效；或  
2. 把目录 `skills/feishu-pps-privacy/` **复制到** `~/.openclaw/skills/feishu-pps-privacy/`；或  
3. 在 `openclaw.json` 的 `skills.load.extraDirs` 中加入本仓库的 `skills` 路径（以你当前配置 schema 为准）。

加载后执行会话 **`/new`** 或 **`openclaw gateway restart`**，并用 **`openclaw skills list`** 确认。

### 二、OpenClaw Gateway 中安装插件

**环境要求**：已安装 OpenClaw CLI 与可运行的 Gateway；本插件以 `openclaw` 为 peer 依赖，需与当前 Gateway 版本匹配。

**与路径无关的三种方式**（避免写死 `/Users/...` 等绝对路径）：

1. **npm / ClawHub 发布后按包名安装**（推荐生产）：`openclaw plugins install @senmud/openclaw-pps`（npm 包名；配置里插件 id 仍为 `openclaw-pps`）。
2. **本仓库脚本**（推荐本地）：在仓库根目录执行  
   `chmod +x scripts/install-openclaw-pps-plugin.sh && ./scripts/install-openclaw-pps-plugin.sh`  
   脚本根据 **自身文件位置** 定位 `openclaw-pps-plugin/`，与当前工作目录无关。若插件目录不在默认位置，可设置 `OPENCLAW_PPS_PLUGIN_DIR`。
3. **手动**：先 `cd` 到 **仓库根**（含 `skills/` 与 `openclaw-pps-plugin/`），再  
   `(cd openclaw-pps-plugin && npm install && npm run build) && openclaw plugins install "$(pwd)/openclaw-pps-plugin"`。

安装后重启或刷新 Gateway，使插件加载。

### 发布到 ClawHub（npm registry）

仓库提供发布脚本：`scripts/publish-clawhub.sh`。

- **先做预检（默认 dry-run，不会真正发布）**：
  `chmod +x scripts/publish-clawhub.sh && ./scripts/publish-clawhub.sh`
- **正式发布**（需 token）：
  `CLAWHUB_TOKEN=你的token ./scripts/publish-clawhub.sh --publish`
- **指定 registry / tag**：
  `CLAWHUB_REGISTRY=https://registry.npmjs.org CLAWHUB_TOKEN=你的token ./scripts/publish-clawhub.sh --publish --tag latest`

脚本会自动执行：`npm install` → `npm run build` → `npm pack --dry-run`，只有传 `--publish` 才会执行 `npm publish`。

### 三、配置 `openclaw.json`

在 `~/.openclaw/openclaw.json`（或你的配置文件路径）的 `plugins.entries` 中启用并传入配置，例如：

```json5
{
  plugins: {
    entries: {
      "openclaw-pps": {
        enabled: true,
        config: {
          ownerOpenId: "ou_xxxxxxxx",
          notifyOwnerOnBlock: true,
          // feishuNotifyAccountId: "main",
          // debug: true,
          // auditPath: "/可选/自定义/audit.jsonl"
        },
      },
    },
  },
}
```

| 配置项 | 含义 |
|--------|------|
| `ownerOpenId` | 主人飞书用户 `open_id`（`ou_xxx`），用于区分主人单聊与非主人单聊 |
| `notifyOwnerOnBlock` | 严格场景拦截后是否向主人飞书单聊推送摘要（需 `channels.feishu` 已配置 `appId`/`appSecret`，且需 `im:message:send_as_bot` 等权限） |
| `feishuNotifyAccountId` | 可选，使用 `channels.feishu.accounts` 下哪个账号发通知；默认 `defaultAccount` 或 `default` |
| `debug` | 可选，打印 PPS 调试日志 |
| `auditPath` | 可选，审计 JSONL 文件路径；默认在 OpenClaw state 目录下插件子目录中 |

**主人通知**：插件会读取 **`openclaw.json` 里已有的 `channels.feishu`**（与机器人通道同源）获取 `tenant_access_token` 并调用 `im/v1/messages` 向 `ownerOpenId` 发文本。若未配置飞书应用或 token 失败，日志会出现 `owner DM failed`。

### 四、审计与报告

- 审计默认为 **追加式 JSONL**，便于按时间段 grep 或自建报表。
- 插件内注册了 **`pps-report`** CLI（具体是否暴露在 `openclaw` 根命令下取决于当前 OpenClaw 版本）；可按 `--since` / `--until` ISO 时间筛选（以插件实现为准）。

### 五、飞书通道本身

飞书机器人、权限、群策略等仍遵循官方说明：[Feishu / Lark 通道文档](https://docs.openclaw.ai/channels/feishu)。

### 六、自动化验证（策略逻辑）

测试代码与用例说明保存在 **`tests/`**：

- `tests/pps-policy.test.ts`：可执行测试（`node:test` + `tsx` 直接跑 TypeScript）
- `tests/pps-policy-cases.md`：用例表与需求对照
- `tests/feishu-notify.test.ts`：飞书主人通知（凭证解析 + mock HTTP）
- `tests/feishu-notify-cases.md`：飞书通知用例说明
- `tests/README.md`：运行方式说明

在 **仓库根目录** 执行（首次需 `npm install` 安装根目录 `devDependencies`）：

```bash
npm test
```

在 `openclaw-pps-plugin` 目录执行 `npm test` 会 **转发到根目录** 的 `npm test`。**完整 Gateway / 飞书联调**仍需在真实 OpenClaw 环境中手动验证。

---

## 文档与参考

- [Creating Skills](https://docs.openclaw.ai/tools/creating-skills) · [Skills](https://docs.openclaw.ai/tools/skills) · [Skills config](https://docs.openclaw.ai/tools/skills-config)
- [OpenClaw Plugin SDK Overview](https://docs.openclaw.ai/plugins/sdk-overview)
- [Plugin Entry（definePluginEntry）](https://docs.openclaw.ai/plugins/sdk-entrypoints)
- [Agent Loop 与插件钩子](https://docs.openclaw.ai/concepts/agent-loop)

---

## 许可证与免责

使用前请根据你的组织合规要求审阅策略与日志留存范围；本仓库示例代码与启发式规则不构成法律意见，生产环境请补充测试与审计流程。
