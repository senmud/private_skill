/**
 * OpenClaw PPS plugin — publish: `@senmud/openclaw-pps`; local: `openclaw plugins install ./openclaw-pps-plugin`
 * Uses Plugin SDK: `api.on` for `inbound_claim` + `before_tool_call` (see OpenClaw types).
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import path from "node:path";
import { appendAudit, readAuditRange } from "./src/audit.js";
import { notifyOwnerFeishuDm } from "./src/feishu-notify.js";
import {
  appendProtectedStatusEmoji,
  consumePendingBlockForOutbound,
  formatBlockedReply,
  isStrictScenario,
  normalizeFeishuChannelId,
  resolveScenario,
  shouldBlockTool,
  stripThreadSuffixFromSessionKey,
  type PendingBlockEntry,
  type PpsScenario,
} from "./src/pps-policy.js";

const PLUGIN_ID = "openclaw-pps";

function defaultAuditPath(stateDir: string): string {
  return path.join(stateDir, PLUGIN_ID, "audit.jsonl");
}

/**
 * Heuristic: Feishu session keys often embed `oc_*` (group) or `ou_*` (user).
 * When inbound_claim did not run, fall back to this; align with your gateway version if needed.
 */
function isFeishuLikeSessionKey(sessionKey: string): boolean {
  const lower = sessionKey.toLowerCase();
  return lower.includes("feishu") || lower.includes("lark");
}

function inferScenarioFromSessionKey(
  sessionKey: string,
  ownerOpenId: string | undefined,
): PpsScenario | undefined {
  if (!sessionKey.includes("feishu") && !sessionKey.includes("lark")) {
    return undefined;
  }
  if (sessionKey.includes("oc_")) {
    return "GROUP";
  }
  const m = sessionKey.match(/ou_[a-zA-Z0-9]+/);
  if (m && ownerOpenId) {
    return m[0] === ownerOpenId ? "OWNER_DM" : "NON_OWNER_DM";
  }
  return undefined;
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Feishu PPS Privacy",
  description:
    "Feishu session privacy: strict group + non-owner DM, permissive owner DM, audit + owner notify",
  register(api) {
    const pc = api.pluginConfig ?? {};
    const ownerOpenId = pc.ownerOpenId as string | undefined;
    const notify = pc.notifyOwnerOnBlock !== false;
    const debug = pc.debug === true;
    const feishuNotifyAccountId = pc.feishuNotifyAccountId as string | undefined;
    const stateDir = api.runtime.state.resolveStateDir();
    const auditPath =
      (pc.auditPath as string | undefined) ?? defaultAuditPath(stateDir);

    const scenarioBySession = new Map<string, PpsScenario>();
    /** Blocked tool → next Feishu/Lark outbound (OpenClaw does not pass runId in message_sending). */
    const pendingBlockedOutbound: PendingBlockEntry[] = [];

    api.on("inbound_claim", (event, ctx) => {
      if (ctx.channelId !== "feishu" && ctx.channelId !== "lark") {
        return;
      }
      const scenario = resolveScenario(
        {
          channelId: ctx.channelId,
          isGroup: event.isGroup,
          senderId: event.senderId,
          from: event.senderId,
        },
        ownerOpenId,
      );
      appendAudit(auditPath, {
        ts: new Date().toISOString(),
        scenario,
        action: "classify",
        severity: "low",
      });
    });

    api.on("before_prompt_build", (_event, ctx) => {
      const sk = ctx.sessionKey;
      if (!sk || (ctx.channelId !== "feishu" && ctx.channelId !== "lark")) {
        return;
      }
      const inferred = inferScenarioFromSessionKey(sk, ownerOpenId);
      if (inferred) {
        scenarioBySession.set(sk, inferred);
      }
    });

    api.on("before_tool_call", (event, ctx) => {
      const sessionKey = ctx.sessionKey ?? "";
      let scenario: PpsScenario | undefined = scenarioBySession.get(sessionKey);
      if (!scenario) {
        scenario = inferScenarioFromSessionKey(sessionKey, ownerOpenId);
        if (scenario) {
          scenarioBySession.set(sessionKey, scenario);
        }
      }
      if (!scenario) {
        scenario = "NON_OWNER_DM";
      }

      const decision = shouldBlockTool({
        scenario,
        toolName: event.toolName,
        toolArgs: event.params,
      });
      if (!decision.block) {
        if (debug) {
          api.logger.debug?.(
            `[pps][before_tool_call] allow tool=${event.toolName} runId=${event.runId ?? "none"} sessionKey=${ctx.sessionKey ?? "none"}`,
          );
        }
        return;
      }
      const sk = ctx.sessionKey;
      if (sk && isFeishuLikeSessionKey(sk)) {
        pendingBlockedOutbound.push({
          sessionKey: stripThreadSuffixFromSessionKey(sk),
          channelId: "feishu",
        });
      }
      if (debug) {
        api.logger.info(
          `[pps][before_tool_call] block tool=${event.toolName} reason=${decision.reason} runId=${event.runId ?? "none"} sessionKey=${ctx.sessionKey ?? "none"}`,
        );
      }

      const reasonText =
        decision.reason === "strict_exec_or_code_path"
          ? "群聊或非主人单聊下禁止命令/代码执行，请改用主人私聊处理。"
          : "已拦截高风险系统操作，请确认后再试。";

      appendAudit(auditPath, {
        ts: new Date().toISOString(),
        scenario,
        action: "block_tool",
        toolName: event.toolName,
        severity: "high",
        reason: decision.reason,
      });

      if (notify && ownerOpenId && isStrictScenario(scenario)) {
        appendAudit(auditPath, {
          ts: new Date().toISOString(),
          scenario,
          action: "notify_owner",
          toolName: event.toolName,
          severity: "medium",
          reason: "owner_digest",
        });
        const ts = new Date().toISOString();
        const digest = [
          "[PPS] 拦截通知",
          `时间: ${ts}`,
          `场景: ${scenario}`,
          `工具: ${event.toolName}`,
          `原因码: ${decision.reason}`,
          "说明: 以上为策略摘要，不含用户原文。",
        ].join("\n");
        void (async () => {
          try {
            await notifyOwnerFeishuDm({
              openclawConfig: api.config as unknown as Record<string, unknown>,
              ownerOpenId,
              body: digest,
              feishuAccountId: feishuNotifyAccountId,
            });
            if (debug) {
              api.logger.info(`[pps] owner DM sent to ${ownerOpenId}`);
            }
          } catch (err) {
            api.logger.warn(
              `[pps] owner DM failed: ${String(err)} — check channels.feishu credentials and bot permissions (im:message:send_as_bot)`,
            );
          }
        })();
      }

      return {
        block: true,
        blockReason: formatBlockedReply(reasonText),
      };
    });

    /**
     * OpenClaw merges `message_sending` results in hook order; later handlers win
     * (`next.content ?? acc?.content`). Use lowest priority so we run last and
     * the status emoji is not overwritten by other plugins.
     */
    api.on(
      "message_sending",
      (event, ctx) => {
        const channel =
          (event.metadata?.channel as string | undefined) ?? ctx.channelId ?? "";
        const blocked = consumePendingBlockForOutbound(
          pendingBlockedOutbound,
          channel,
          event.to,
        );
        const nextContent = appendProtectedStatusEmoji(event.content, blocked);
        if (debug) {
          api.logger.info(
            `[pps][message_sending] channel=${normalizeFeishuChannelId(channel) || "none"} to=${event.to || "none"} blocked=${blocked ? "yes" : "no"} pending=${pendingBlockedOutbound.length}`,
          );
        }
        return {
          content: nextContent,
        };
      },
      { priority: -10_000 },
    );

    api.registerCli(
      (registrar) => {
        registrar.program
          .command("pps-report")
          .description("PPS audit summary (GROUP + non-owner DM)")
          .option("--since <iso>", "ISO start")
          .option("--until <iso>", "ISO end")
          .action((opts: { since?: string; until?: string }) => {
            const since = opts.since ? new Date(opts.since) : new Date(0);
            const until = opts.until ? new Date(opts.until) : new Date();
            const rows = readAuditRange(auditPath, since, until).filter(
              (r) => r.scenario === "GROUP" || r.scenario === "NON_OWNER_DM",
            );
            const summary = {
              window: { since: since.toISOString(), until: until.toISOString() },
              counts: rows.reduce(
                (acc, r) => {
                  acc[r.action] = (acc[r.action] ?? 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
              entries: rows.length,
            };
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(summary, null, 2));
          });
      },
      { commands: ["pps-report"] },
    );
  },
});
