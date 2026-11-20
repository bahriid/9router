import { describe, it, expect } from "vitest";
import { convertResponsesStreamToJson } from "../../open-sse/transformer/streamToJsonConverter.js";

const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`;

describe("convertResponsesStreamToJson", () => {
  it("keeps usage when the run ends with response.incomplete (max tokens hit)", async () => {
    const sse = ev("response.created", { response: { id: "resp_x", created_at: 1 } })
      + ev("response.incomplete", { response: { usage: { input_tokens: 12, output_tokens: 20, total_tokens: 32 } } });
    const r = await convertResponsesStreamToJson(new Response(sse).body);
    expect(r.status).toBe("incomplete");
    expect(r.usage.total_tokens).toBe(32);
  });
});
