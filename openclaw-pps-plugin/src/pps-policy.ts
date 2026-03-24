/** PPS scenario and policy helpers (no OpenClaw imports). */

export type PpsScenario = "GROUP" | "OWNER_DM" | "NON_OWNER_DM";

export type FeishuLikeContext = {
  channelId?: string;
  isGroup?: boolean;
  senderId?: string;
  from?: string;
};

export function resolveScenario(
  ctx: FeishuLikeContext,
  ownerOpenId: string | undefined,
): PpsScenario {
  const isFeishu = ctx.channelId === "feishu" || ctx.channelId === "lark";
  if (!isFeishu) {
    return "OWNER_DM";
  }
  if (ctx.isGroup === true) {
    return "GROUP";
  }
  const sender = ctx.senderId ?? ctx.from;
  if (!ownerOpenId || !sender) {
    return "NON_OWNER_DM";
  }
  return sender === ownerOpenId ? "OWNER_DM" : "NON_OWNER_DM";
}

export function isStrictScenario(s: PpsScenario): boolean {
  return s === "GROUP" || s === "NON_OWNER_DM";
}

/** Heuristic: command/exec/code-run tools — extend per your agent tool registry. */
const STRICT_BLOCKED = [
  "exec",
  "bash",
  "shell",
  "run_terminal",
  "terminal",
  "execute",
  "code_interpreter",
  "sandbox",
  "subprocess",
];

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bformat\s+c:/i,
  /删除\s*全部|格式化\s*磁盘/,
];

export function shouldBlockTool(params: {
  scenario: PpsScenario;
  toolName: string;
  toolArgs?: Record<string, unknown>;
}): { block: boolean; reason: string } {
  const name = params.toolName.toLowerCase();
  const argsStr = JSON.stringify(params.toolArgs ?? {});

  if (params.scenario === "OWNER_DM") {
    for (const p of DESTRUCTIVE_PATTERNS) {
      if (p.test(argsStr) || p.test(name)) {
        return { block: true, reason: "destructive_system_operation" };
      }
    }
    if (STRICT_BLOCKED.some((k) => name.includes(k))) {
      return { block: false, reason: "" };
    }
    return { block: false, reason: "" };
  }

  if (isStrictScenario(params.scenario)) {
    if (STRICT_BLOCKED.some((k) => name.includes(k))) {
      return { block: true, reason: "strict_exec_or_code_path" };
    }
    return { block: false, reason: "" };
  }

  return { block: false, reason: "" };
}

export const PPS_SUFFIX =
  "您的信息在PPS系统保护之下。隐私安全、安心养虾。";
export const PPS_PASS_EMOJI = "✅";
export const PPS_BLOCK_EMOJI = "❌";

/** User-visible message: total length ≤ 200 chars including suffix. */
export function formatBlockedReply(analysis: string): string {
  const base = `${analysis.trim()} ${PPS_SUFFIX} ${PPS_BLOCK_EMOJI}`;
  if (base.length <= 200) {
    return base;
  }
  const maxAnalysis = 200 - PPS_SUFFIX.length - PPS_BLOCK_EMOJI.length - 2;
  const clipped = analysis.trim().slice(0, Math.max(0, maxAnalysis));
  return `${clipped} ${PPS_SUFFIX} ${PPS_BLOCK_EMOJI}`;
}

export function appendProtectedStatusEmoji(
  text: string,
  blocked: boolean,
): string {
  const content = text.trimEnd();
  if (content.endsWith(PPS_PASS_EMOJI) || content.endsWith(PPS_BLOCK_EMOJI)) {
    return content;
  }
  return `${content} ${blocked ? PPS_BLOCK_EMOJI : PPS_PASS_EMOJI}`;
}

/** OpenClaw aliases `lark` → `feishu` for delivery; normalize for comparisons. */
export function normalizeFeishuChannelId(channel: string): string {
  const c = channel.trim().toLowerCase();
  return c === "lark" ? "feishu" : c;
}

/** Strip `:thread:…` suffix so peer segment matches outbound `to`. */
export function stripThreadSuffixFromSessionKey(sessionKey: string): string {
  return sessionKey.replace(/:thread:[^:]+$/i, "").trim();
}

/**
 * Extract Feishu/Lark peer id (e.g. oc_ / ou_) from agent session keys built by
 * OpenClaw (`…:group:…`, `…:direct:…`, `…:account:direct:…`). Returns undefined
 * for legacy main-only keys with no peer segment.
 */
export function extractFeishuPeerIdFromSessionKey(
  sessionKey: string,
): string | undefined {
  const s = stripThreadSuffixFromSessionKey(sessionKey);
  const lower = s.toLowerCase();
  if (!lower.includes("feishu") && !lower.includes("lark")) return undefined;
  const patterns = [
    /:(?:feishu|lark):[^:]+:direct:([a-z0-9_]+)$/i,
    /:(?:feishu|lark):direct:([a-z0-9_]+)$/i,
    /:(?:feishu|lark):group:([a-z0-9_]+)$/i,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return undefined;
}

export type PendingBlockEntry = { sessionKey: string; channelId: string };

/**
 * Correlate a blocked tool call with the next outbound message. OpenClaw
 * `message_sending` does not pass `runId` in metadata — match `event.to` to the
 * peer id embedded in `sessionKey`, or FIFO-fallback when the key has no peer
 * (e.g. main DM scope).
 */
export function consumePendingBlockForOutbound(
  pending: PendingBlockEntry[],
  channel: string,
  to: string,
): boolean {
  const ch = normalizeFeishuChannelId(channel);
  if (ch !== "feishu") return false;
  const toNorm = to.trim().toLowerCase();
  if (!toNorm) return false;

  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    if (normalizeFeishuChannelId(p.channelId) !== ch) continue;
    const peer = extractFeishuPeerIdFromSessionKey(p.sessionKey);
    if (peer && peer === toNorm) {
      pending.splice(i, 1);
      return true;
    }
  }

  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    if (normalizeFeishuChannelId(p.channelId) !== ch) continue;
    if (!extractFeishuPeerIdFromSessionKey(p.sessionKey)) {
      pending.splice(i, 1);
      return true;
    }
  }
  return false;
}
