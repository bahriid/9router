/**
 * Wait for the first body chunk of a streaming response.
 * An upstream that sends headers and then nothing (a slow or throttled account) times out,
 * so the caller can cancel it and try another account instead of making the client wait minutes.
 * On success the returned response replays the first chunk and streams the rest unchanged.
 */
export async function awaitFirstChunk(response, timeoutMs) {
  if (!response?.body || !timeoutMs) return { timedOut: false, response };
  const reader = response.body.getReader();
  let timer;
  const TIMEOUT = Symbol("timeout");
  const first = await Promise.race([
    reader.read(),
    new Promise((r) => { timer = setTimeout(() => r(TIMEOUT), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));

  if (first === TIMEOUT) {
    reader.cancel().catch(() => {});
    return { timedOut: true, response: null };
  }

  const body = new ReadableStream({
    start(controller) {
      if (first.done) { controller.close(); return; }
      controller.enqueue(first.value);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return {
    timedOut: false,
    response: new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }),
  };
}
