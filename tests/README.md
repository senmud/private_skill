# tests/

本目录保存 **PPS 策略** 的自动化测试 **源码** 与 **用例说明**。

| 文件 | 说明 |
|------|------|
| `pps-policy.test.ts` | 可执行测试（`node:test`），导入 `openclaw-pps-plugin/src/pps-policy.ts` |
| `pps-policy-cases.md` | 用例表与需求对照，便于评审与归档 |
| `feishu-notify.test.ts` | 飞书主人通知：凭证解析 + mock `fetch` 的功能测试 |
| `feishu-notify-cases.md` | 上述用例说明 |

## 运行

```bash
# 仓库根目录
npm test
```

需已安装根目录 `devDependencies`（`tsx`）。首次执行：

```bash
npm install
```

## 说明

- 业务逻辑仍在 `openclaw-pps-plugin/src/pps-policy.ts`，测试不重复实现策略。
- Gateway / 飞书端到端联调不在本目录覆盖，需在真实 OpenClaw 环境中单独验证。
