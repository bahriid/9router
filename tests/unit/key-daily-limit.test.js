// Per-key daily token limit: tokens used by a key in the last 24 h (from
// usageHistory) at or over its dailyTokenLimit => 429. 0 / unset = no limit.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

async function boot() {
  delete global._dbAdapter;
  vi.resetModules();
  const db = await import("@/lib/db/index.js");
  const { getAdapter } = await import("@/lib/db/driver.js");
  const quota = await import("@/sse/services/keyAccess.js");
  return { db, adapter: await getAdapter(), quota };
}

function use(adapter, key, tokens, hoursAgo = 1) {
  const ts = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  adapter.run(
    `INSERT INTO usageHistory(timestamp, provider, model, apiKey, promptTokens, completionTokens) VALUES(?, 'x', 'm', ?, ?, ?)`,
    [ts, key, tokens, 0]
  );
}

const req = (key) => new Request("http://x/v1/chat/completions", { headers: { Authorization: `Bearer ${key}` } });

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-key-limit-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("dailyTokenLimit", () => {
  it("defaults to 0 (no limit) and is saved by updateApiKey", async () => {
    const { db } = await boot();
    const k = await db.createApiKey("tester", "m1");
    expect((await db.getApiKeyById(k.id)).dailyTokenLimit).toBe(0);
    await db.updateApiKey(k.id, { dailyTokenLimit: 100 });
    expect((await db.getApiKeyById(k.id)).dailyTokenLimit).toBe(100);
  });

  it("blocks a key at its limit over the last 24 h, ignores older use and other keys", async () => {
    const { db, adapter, quota } = await boot();
    const a = await db.createApiKey("a", "m1");
    const b = await db.createApiKey("b", "m1");
    await db.updateApiKey(a.id, { dailyTokenLimit: 100 });

    use(adapter, a.key, 500, 30); // older than 24 h
    use(adapter, a.key, 60);
    expect(await quota.enforceKeyDailyLimit(req(a.key))).toBeNull();

    use(adapter, a.key, 40); // now 100 = limit
    const denied = await quota.enforceKeyDailyLimit(req(a.key));
    expect(denied.status).toBe(429);

    use(adapter, b.key, 10_000); // b has no limit
    expect(await quota.enforceKeyDailyLimit(req(b.key))).toBeNull();
    expect(await quota.enforceKeyDailyLimit(req("sk-unknown"))).toBeNull();
  });
});
