# PPS 自动化测试用例说明

对应实现：`openclaw-pps-plugin/src/pps-policy.ts`  
测试代码：`tests/pps-policy.test.ts`  

## 用例总览

| 分组 | 用例名 | 预期 |
|------|--------|------|
| `resolveScenario` | GROUP when feishu + isGroup | `channelId=feishu` 且 `isGroup=true` → `GROUP` |
| `resolveScenario` | OWNER_DM when feishu DM + sender matches owner | 单聊且 `senderId === ownerOpenId` → `OWNER_DM` |
| `resolveScenario` | NON_OWNER_DM when feishu DM + sender differs | 单聊且发送方 ≠ 主人 → `NON_OWNER_DM` |
| `resolveScenario` | NON_OWNER_DM when owner unknown and DM | 未配置 `ownerOpenId` 时单聊 → `NON_OWNER_DM`（偏严） |
| `resolveScenario` | lark channel treated as feishu-like | `channelId=lark` 且群聊 → `GROUP` |
| `shouldBlockTool` | strict: blocks shell-like tools | `GROUP` + `run_terminal_cmd` → `block=true`，`reason=strict_exec_or_code_path` |
| `shouldBlockTool` | strict: same for NON_OWNER_DM | `NON_OWNER_DM` + `bash` → `block=true` |
| `shouldBlockTool` | OWNER_DM: allows shell-like tools | `OWNER_DM` + `run_terminal_cmd` → `block=false` |
| `shouldBlockTool` | OWNER_DM: blocks destructive rm -rf / | 参数中含 `rm -rf /` → `block=true`，`reason=destructive_system_operation` |
| `formatBlockedReply` | length ≤ 200 including suffix | 超长分析文本截断后总长 ≤200，且以 `PPS_SUFFIX` 结尾 |
| `formatBlockedReply` | keeps short message + suffix | 短文本含固定尾句且总长 ≤200 |

## 与产品需求的对照

- **群聊 / 非主人单聊最严**：严格场景下拦截 shell/终端类工具名（见 `STRICT_BLOCKED` 启发式）。
- **主人单聊最宽**：允许 `run_terminal_cmd`；仅对破坏性参数模式拦截。
- **话术**：`formatBlockedReply` 保证含 `PPS_SUFFIX`，且整段长度不超过 200 字符。

## 运行

在仓库根目录执行 `npm test`（见根目录 `package.json`）。亦可在 `openclaw-pps-plugin` 内执行 `npm test`（转发到根目录）。
