import fs from "node:fs";
import path from "node:path";

export type AuditEntry = {
  ts: string;
  scenario: string;
  action: "block_tool" | "redact" | "notify_owner" | "classify";
  toolName?: string;
  severity: "low" | "medium" | "high";
  reason?: string;
};

export function appendAudit(auditFile: string, entry: AuditEntry): void {
  fs.mkdirSync(path.dirname(auditFile), { recursive: true });
  fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`, "utf8");
}

export function readAuditRange(
  auditFile: string,
  since: Date,
  until: Date,
): AuditEntry[] {
  if (!fs.existsSync(auditFile)) {
    return [];
  }
  const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
  const out: AuditEntry[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as AuditEntry;
      const t = new Date(row.ts).getTime();
      if (t >= since.getTime() && t <= until.getTime()) {
        out.push(row);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}
