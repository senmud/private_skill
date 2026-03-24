/**
 * Send a plain-text DM to a Feishu/Lark user via Open Platform HTTP API.
 * Uses the same app credentials as `channels.feishu` in openclaw.json.
 */

export type FeishuDomainKind = "feishu" | "lark";

const FEISHU_HOST = "https://open.feishu.cn";
const LARK_HOST = "https://open.larksuite.com";

function resolveApiHost(domain: FeishuDomainKind | string | undefined): string {
  if (domain === "lark") {
    return LARK_HOST;
  }
  return FEISHU_HOST;
}

type FeishuAccount = {
  appId?: string;
  appSecret?: string;
  domain?: FeishuDomainKind | string;
};

type FeishuChannelSection = {
  defaultAccount?: string;
  accounts?: Record<string, FeishuAccount>;
  domain?: FeishuDomainKind | string;
};

export function resolveFeishuAccountForNotify(
  cfg: Record<string, unknown>,
  preferredAccountId?: string,
): { accountId: string; appId: string; appSecret: string; apiHost: string } | null {
  const section = (cfg.channels as { feishu?: FeishuChannelSection } | undefined)?.feishu;
  if (!section?.accounts || typeof section.accounts !== "object") {
    return null;
  }
  const accountId =
    preferredAccountId?.trim() ||
    section.defaultAccount?.trim() ||
    "default";
  const acc = section.accounts[accountId] ?? section.accounts.default;
  if (!acc?.appId || !acc.appSecret) {
    return null;
  }
  const domain = acc.domain ?? section.domain ?? "feishu";
  return {
    accountId,
    appId: acc.appId,
    appSecret: acc.appSecret,
    apiHost: resolveApiHost(domain),
  };
}

async function fetchTenantAccessToken(
  apiHost: string,
  appId: string,
  appSecret: string,
): Promise<string> {
  const res = await fetch(`${apiHost}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await res.json()) as { code?: number; tenant_access_token?: string; msg?: string };
  if (!res.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`tenant_access_token: ${data.msg ?? res.statusText}`);
  }
  return data.tenant_access_token;
}

export async function sendFeishuTextToOpenId(params: {
  apiHost: string;
  tenantAccessToken: string;
  receiveOpenId: string;
  text: string;
}): Promise<void> {
  const url = new URL(`${params.apiHost}/open-apis/im/v1/messages`);
  url.searchParams.set("receive_id_type", "open_id");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: params.receiveOpenId,
      msg_type: "text",
      content: JSON.stringify({ text: params.text }),
    }),
  });
  const data = (await res.json()) as { code?: number; msg?: string };
  if (!res.ok || data.code !== 0) {
    throw new Error(`im/v1/messages: ${data.msg ?? res.statusText}`);
  }
}

export async function notifyOwnerFeishuDm(params: {
  openclawConfig: Record<string, unknown>;
  ownerOpenId: string;
  body: string;
  feishuAccountId?: string;
}): Promise<void> {
  const creds = resolveFeishuAccountForNotify(
    params.openclawConfig,
    params.feishuAccountId,
  );
  if (!creds) {
    throw new Error(
      "missing channels.feishu.accounts.*.appId/appSecret in openclaw.json (or unknown account id)",
    );
  }
  const token = await fetchTenantAccessToken(creds.apiHost, creds.appId, creds.appSecret);
  await sendFeishuTextToOpenId({
    apiHost: creds.apiHost,
    tenantAccessToken: token,
    receiveOpenId: params.ownerOpenId,
    text: params.body,
  });
}
