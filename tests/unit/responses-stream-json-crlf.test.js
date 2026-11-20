import { describe, it, expect } from "vitest";
import { convertResponsesStreamToJson } from "../../open-sse/transformer/streamToJsonConverter.js";

const ev = (t, d) => `event: ${t}\r\ndata: ${JSON.stringify({ type: t, ...d })}\r\n\r\n`;

describe("convertResponsesStreamToJson", () => {
  it("reads CRLF-framed SSE (Muse) past the first event", async () => {
    const sse = ev("response.created", { response: { id: "resp_x", created_at: 1 } })
      + ev("response.output_item.done", { output_index: 0, item: { type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] } })
      + ev("response.completed", { response: { usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 } } });
    const r = await convertResponsesStreamToJson(new Response(sse).body);
    expect(r.status).toBe("completed");
    expect(r.output[0].content[0].text).toBe("ok");
    expect(r.usage.total_tokens).toBe(6);
  });
});
