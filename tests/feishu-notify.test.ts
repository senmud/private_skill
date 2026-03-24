/**
 * Feishu owner DM helper tests: credential resolution + mocked HTTP flow.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  notifyOwnerFeishuDm,
  resolveFeishuAccountForNotify,
} from "../openclaw-pps-plugin/src/feishu-notify.js";

describe("resolveFeishuAccountForNotify", () => {
  it("returns null when channels.feishu.accounts is missing", () => {
    assert.equal(resolveFeishuAccountForNotify({ channels: {} }), null);
    assert.equal(resolveFeishuAccountForNotify({}), null);
  });

  it("returns null when appId or appSecret missing", () => {
    const cfg = {
      channels: {
        feishu: {
          accounts: {
            default: { appId: "cli_x" },
          },
        },
      },
    };
    assert.equal(resolveFeishuAccountForNotify(cfg as Record<string, unknown>), null);
  });

  it("uses defaultAccount and feishu host by default", () => {
    const cfg = {
      channels: {
        feishu: {
          defaultAccount: "main",
          accounts: {
            main: { appId: "cli_a", appSecret: "sec_a" },
          },
        },
      },
    };
    const r = resolveFeishuAccountForNotify(cfg as Record<string, unknown>);
    assert.ok(r);
    assert.equal(r!.accountId, "main");
    assert.equal(r!.appId, "cli_a");
    assert.equal(r!.apiHost, "https://open.feishu.cn");
  });

  it("prefers feishuNotifyAccountId when passed as second arg", () => {
    const cfg = {
      channels: {
        feishu: {
          defaultAccount: "main",
          accounts: {
            main: { appId: "cli_m", appSecret: "sec_m" },
            backup: { appId: "cli_b", appSecret: "sec_b" },
          },
        },
      },
    };
    const r = resolveFeishuAccountForNotify(
      cfg as Record<string, unknown>,
      "backup",
    );
    assert.ok(r);
    assert.equal(r!.accountId, "backup");
    assert.equal(r!.appId, "cli_b");
  });

  it("uses lark API host when domain is lark", () => {
    const cfg = {
      channels: {
        feishu: {
          accounts: {
            default: {
              appId: "cli_x",
              appSecret: "sec_x",
              domain: "lark",
            },
          },
        },
      },
    };
    const r = resolveFeishuAccountForNotify(cfg as Record<string, unknown>);
    assert.ok(r);
    assert.equal(r!.apiHost, "https://open.larksuite.com");
  });
});

describe("notifyOwnerFeishuDm (mocked fetch)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // reset between tests
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("requests tenant token then sends im message", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      urls.push(String(input));
      const u = String(input);
      if (u.includes("tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({ code: 0, tenant_access_token: "test-token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/im/v1/messages")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        assert.equal(body.receive_id, "ou_owner");
        assert.equal(body.msg_type, "text");
        return new Response(JSON.stringify({ code: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("unexpected", { status: 500 });
    };

    const cfg = {
      channels: {
        feishu: {
          accounts: {
            default: { appId: "cli_t", appSecret: "sec_t" },
          },
        },
      },
    };

    await notifyOwnerFeishuDm({
      openclawConfig: cfg as Record<string, unknown>,
      ownerOpenId: "ou_owner",
      body: "hello digest",
    });

    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes("tenant_access_token"));
    assert.ok(urls[1].includes("/im/v1/messages"));
    assert.ok(urls[1].includes("receive_id_type=open_id"));
  });

  it("throws when credentials missing", async () => {
    await assert.rejects(
      () =>
        notifyOwnerFeishuDm({
          openclawConfig: { channels: {} } as Record<string, unknown>,
          ownerOpenId: "ou_x",
          body: "x",
        }),
      /missing channels\.feishu/,
    );
  });
});
