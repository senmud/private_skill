/**
 * OpenClaw PPS plugin — install: `openclaw plugins install ./openclaw-pps-plugin`
 * Uses Plugin SDK: `api.on` for `inbound_claim` + `before_tool_call` (see OpenClaw types).
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import path from "node:path";
import { appendAudit, readAuditRange } from "./src/audit.js";
import {
  appendProtectedStatusEmoji,
  formatBlockedReply,
  isStrictScenario,
  resolveScenario,
  shouldBlockTool,
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
    const stateDir = api.runtime.state.resolveStateDir();
    const auditPath =
      (pc.auditPath as string | undefined) ?? defaultAuditPath(stateDir);

    const scenarioBySession = new Map<string, PpsScenario>();
    const blockedRunIds = new Set<string>();

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
      if (event.runId) {
        blockedRunIds.add(event.runId);
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
        api.logger.info(
          `[pps] notify owner (${ownerOpenId}): blocked ${event.toolName} in ${scenario} — implement Feishu DM send here`,
        );
      }

      return {
        block: true,
        blockReason: formatBlockedReply(reasonText),
      };
    });

    api.on("message_sending", (event) => {
      const runId = (event.metadata as { runId?: string } | undefined)?.runId;
      const blocked = Boolean(runId && blockedRunIds.has(runId));
      if (runId && blocked) {
        blockedRunIds.delete(runId);
      }
      const nextContent = appendProtectedStatusEmoji(event.content, blocked);
      if (debug) {
        api.logger.info(
          `[pps][message_sending] runId=${runId ?? "none"} blocked=${blocked ? "yes" : "no"} hasEmoji=${nextContent.endsWith("✅") || nextContent.endsWith("❌") ? "yes" : "no"}`,
        );
      }
      return {
        content: nextContent,
      };
    });

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
