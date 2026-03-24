/**
 * PPS 策略自动化测试（Node.js 内置 node:test）
 * 依赖：先编译 openclaw-pps-plugin 中的 pps-policy，或直接用 tsx 加载 TS 源码。
 *
 * 运行（仓库根目录）：
 *   npm test
 *
 * 或仅跑插件构建 + 测试：
 *   npm run build --prefix openclaw-pps-plugin && node --import tsx/esm --test tests/pps-policy.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendProtectedStatusEmoji,
  consumePendingBlockForOutbound,
  extractFeishuPeerIdFromSessionKey,
  formatBlockedReply,
  normalizeFeishuChannelId,
  PPS_BLOCK_EMOJI,
  PPS_PASS_EMOJI,
  PPS_SUFFIX,
  resolveScenario,
  shouldBlockTool,
} from "../openclaw-pps-plugin/src/pps-policy.js";

describe("resolveScenario", () => {
  it("GROUP when feishu + isGroup", () => {
    assert.equal(
      resolveScenario(
        { channelId: "feishu", isGroup: true, senderId: "ou_a" },
        "ou_owner",
      ),
      "GROUP",
    );
  });

  it("OWNER_DM when feishu DM + sender matches owner", () => {
    assert.equal(
      resolveScenario(
        { channelId: "feishu", isGroup: false, senderId: "ou_owner" },
        "ou_owner",
      ),
      "OWNER_DM",
    );
  });

  it("NON_OWNER_DM when feishu DM + sender differs", () => {
    assert.equal(
      resolveScenario(
        { channelId: "feishu", isGroup: false, senderId: "ou_other" },
        "ou_owner",
      ),
      "NON_OWNER_DM",
    );
  });

  it("NON_OWNER_DM when owner unknown and DM", () => {
    assert.equal(
      resolveScenario({ channelId: "feishu", isGroup: false, senderId: "ou_x" }, undefined),
      "NON_OWNER_DM",
    );
  });

  it("lark channel treated as feishu-like", () => {
    assert.equal(resolveScenario({ channelId: "lark", isGroup: true }, undefined), "GROUP");
  });
});

describe("shouldBlockTool", () => {
  it("strict: blocks shell-like tools", () => {
    const r = shouldBlockTool({
      scenario: "GROUP",
      toolName: "run_terminal_cmd",
      toolArgs: {},
    });
    assert.equal(r.block, true);
    assert.equal(r.reason, "strict_exec_or_code_path");
  });

  it("strict: same for NON_OWNER_DM", () => {
    const r = shouldBlockTool({
      scenario: "NON_OWNER_DM",
      toolName: "bash",
      toolArgs: {},
    });
    assert.equal(r.block, true);
  });

  it("OWNER_DM: allows shell-like tools", () => {
    const r = shouldBlockTool({
      scenario: "OWNER_DM",
      toolName: "run_terminal_cmd",
      toolArgs: { command: "echo ok" },
    });
    assert.equal(r.block, false);
  });

  it("OWNER_DM: blocks destructive rm -rf /", () => {
    const r = shouldBlockTool({
      scenario: "OWNER_DM",
      toolName: "exec",
      toolArgs: { cmd: "rm -rf /" },
    });
    assert.equal(r.block, true);
    assert.equal(r.reason, "destructive_system_operation");
  });

  it("formatBlockedReply length ≤ 200 including suffix", () => {
    const long = "x".repeat(300);
    const out = formatBlockedReply(long);
    assert.ok(out.length <= 200);
    assert.ok(out.endsWith(`${PPS_SUFFIX} ${PPS_BLOCK_EMOJI}`));
  });

  it("formatBlockedReply keeps short message + suffix", () => {
    const out = formatBlockedReply("短说明。");
    assert.ok(out.includes(PPS_SUFFIX));
    assert.ok(out.endsWith(PPS_BLOCK_EMOJI));
    assert.ok(out.length <= 200);
  });

  it("appendProtectedStatusEmoji appends ✅ for normal replies", () => {
    const out = appendProtectedStatusEmoji("正常回复内容", false);
    assert.ok(out.endsWith(PPS_PASS_EMOJI));
  });

  it("appendProtectedStatusEmoji appends ❌ for blocked replies", () => {
    const out = appendProtectedStatusEmoji("拦截回复内容", true);
    assert.ok(out.endsWith(PPS_BLOCK_EMOJI));
  });

  it("appendProtectedStatusEmoji does not duplicate emoji", () => {
    const ok = appendProtectedStatusEmoji(`文本 ${PPS_PASS_EMOJI}`, false);
    const blocked = appendProtectedStatusEmoji(`文本 ${PPS_BLOCK_EMOJI}`, true);
    assert.equal(ok, `文本 ${PPS_PASS_EMOJI}`);
    assert.equal(blocked, `文本 ${PPS_BLOCK_EMOJI}`);
  });
});

describe("extractFeishuPeerIdFromSessionKey", () => {
  it("parses group peer", () => {
    assert.equal(
      extractFeishuPeerIdFromSessionKey(
        "agent:main:feishu:group:oc_abc123",
      ),
      "oc_abc123",
    );
  });

  it("parses direct peer (per-channel-peer)", () => {
    assert.equal(
      extractFeishuPeerIdFromSessionKey("agent:main:feishu:direct:ou_xyz"),
      "ou_xyz",
    );
  });

  it("parses direct peer (per-account-channel-peer)", () => {
    assert.equal(
      extractFeishuPeerIdFromSessionKey(
        "agent:main:feishu:myacct:direct:ou_peer",
      ),
      "ou_peer",
    );
  });

  it("strips thread suffix before parsing", () => {
    assert.equal(
      extractFeishuPeerIdFromSessionKey(
        "agent:main:feishu:group:oc_t:thread:99",
      ),
      "oc_t",
    );
  });
});

describe("consumePendingBlockForOutbound", () => {
  it("matches outbound to by peer id", () => {
    const pending = [
      {
        sessionKey: "agent:main:feishu:direct:ou_match",
        channelId: "feishu",
      },
    ];
    assert.equal(
      consumePendingBlockForOutbound(pending, "feishu", "ou_match"),
      true,
    );
    assert.equal(pending.length, 0);
  });

  it("treats lark and feishu as the same channel for matching", () => {
    const pending = [
      {
        sessionKey: "agent:main:feishu:direct:ou_match",
        channelId: "feishu",
      },
    ];
    assert.equal(
      consumePendingBlockForOutbound(pending, "lark", "ou_match"),
      true,
    );
    assert.equal(pending.length, 0);
  });

  it("does not consume when to differs", () => {
    const pending = [
      {
        sessionKey: "agent:main:feishu:direct:ou_a",
        channelId: "feishu",
      },
    ];
    assert.equal(
      consumePendingBlockForOutbound(pending, "feishu", "ou_b"),
      false,
    );
    assert.equal(pending.length, 1);
  });
});

describe("normalizeFeishuChannelId", () => {
  it("maps lark to feishu", () => {
    assert.equal(normalizeFeishuChannelId("lark"), "feishu");
    assert.equal(normalizeFeishuChannelId("Lark"), "feishu");
  });
});
