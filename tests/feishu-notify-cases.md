# Feishu 主人通知 — 测试用例说明

实现：`openclaw-pps-plugin/src/feishu-notify.ts`  
测试：`tests/feishu-notify.test.ts`

## 单元：`resolveFeishuAccountForNotify`

| 用例 | 预期 |
|------|------|
| 无 `channels.feishu.accounts` | `null` |
| 仅有 `appId` 无 `appSecret` | `null` |
| 正常 `defaultAccount` + `accounts.main` | 返回 `appId`/`appSecret`，`apiHost` 为 `https://open.feishu.cn` |
| 第二参数指定账号 `backup` | 使用 `accounts.backup` |
| `domain: lark` | `apiHost` 为 `https://open.larksuite.com` |

## 功能测试（mock `fetch`）：`notifyOwnerFeishuDm`

| 用例 | 预期 |
|------|------|
| 配置完整 | 依次请求 `tenant_access_token/internal` 与 `im/v1/messages?receive_id_type=open_id`，且 body 含 `receive_id`、文本 |
| 无凭证 | `reject`，错误信息含 `missing channels.feishu` |

## 非自动化范围

- 真实 **飞书租户**、**网络**、**权限**、**主人 open_id** 需在 **Gateway + 真机** 上手动验证。
