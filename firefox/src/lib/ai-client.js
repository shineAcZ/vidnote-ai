const chrome = globalThis.browser;

export class AiClient {
  constructor() {
    this.port = null;
    this.pending = new Map();
  }

  connect() {
    if (this.port) return;
    this.port = chrome.runtime.connect({ name: "vidnote-ai" });
    this.port.onMessage.addListener((message) => {
      const request = this.pending.get(message.requestId);
      if (!request) return;
      if (message.type === "reasoning") request.onReasoning?.();
      if (message.type === "delta") request.onDelta?.(message.text);
      if (message.type === "done") {
        this.pending.delete(message.requestId);
        request.resolve({ usage: message.usage || null, finishReason: message.finishReason || "stop" });
      }
      if (message.type === "error" || message.type === "cancelled") {
        this.pending.delete(message.requestId);
        const error = new Error(message.error || "请求失败");
        error.cancelled = message.type === "cancelled";
        error.status = message.status || null;
        error.retryAfter = message.retryAfter || null;
        request.reject(error);
      }
    });
    this.port.onDisconnect.addListener(() => {
      for (const request of this.pending.values()) request.reject(new Error("AI 连接已中断，已完成内容仍然保存在本地"));
      this.pending.clear();
      this.port = null;
    });
  }

  generate(config, messages, onDelta, onReasoning) {
    this.connect();
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onDelta, onReasoning });
      this.port.postMessage({ type: "generate", requestId, config, messages });
    }).then((result) => ({ ...result, requestId }));
  }

  cancelAll() {
    if (!this.port) return;
    for (const requestId of this.pending.keys()) this.port.postMessage({ type: "cancel", requestId });
  }
}
