import { describe, it, expect } from "vitest";
import { awaitFirstChunk } from "@/lib/firstTokenGate.js";

const enc = new TextEncoder();
const streamOf = (chunks, delayMs = 0) => new ReadableStream({
  async start(c) {
    for (const x of chunks) { if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); c.enqueue(enc.encode(x)); }
    c.close();
  },
});

describe("first token gate", () => {
  it("passes a stream that starts in time, with every byte kept", async () => {
    const res = new Response(streamOf(["a", "b", "c"]), { status: 200, headers: { "x-k": "1" } });
    const out = await awaitFirstChunk(res, 200);
    expect(out.timedOut).toBe(false);
    expect(out.response.headers.get("x-k")).toBe("1");
    expect(await out.response.text()).toBe("abc");
  });

  it("times out a stream that stays silent", async () => {
    const res = new Response(new ReadableStream({ start() {} }), { status: 200 });
    const out = await awaitFirstChunk(res, 50);
    expect(out.timedOut).toBe(true);
  });

  it("leaves a response without a body alone", async () => {
    const res = new Response(null, { status: 204 });
    const out = await awaitFirstChunk(res, 50);
    expect(out.timedOut).toBe(false);
    expect(out.response.status).toBe(204);
  });
});
