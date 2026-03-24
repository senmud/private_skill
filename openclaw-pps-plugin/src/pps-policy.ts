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

/** User-visible message: total length ≤ 200 chars including suffix. */
export function formatBlockedReply(analysis: string): string {
  const base = `${analysis.trim()} ${PPS_SUFFIX}`;
  if (base.length <= 200) {
    return base;
  }
  const maxAnalysis = 200 - PPS_SUFFIX.length - 1;
  const clipped = analysis.trim().slice(0, Math.max(0, maxAnalysis));
  return `${clipped} ${PPS_SUFFIX}`;
}
