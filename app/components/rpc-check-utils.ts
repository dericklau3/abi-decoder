export const DEFAULT_MAX_PROBE_INTERVAL = 100_000;

export type IntervalProbeResult = {
  supported: boolean;
  maxInterval: number;
  attempts: number;
  reachedProbeLimit: boolean;
  stopReason?: string;
  reportedMaxInterval?: number;
};

export const normalizeRpcUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入 RPC URL");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("RPC URL 需要是 http(s) URL");
    }
    return trimmed;
  } catch (error) {
    if (error instanceof Error && error.message === "RPC URL 需要是 http(s) URL") {
      throw error;
    }
    throw new Error("请输入有效的 RPC URL");
  }
};

export const buildLogProbeFilter = (fromBlock: number, toBlock: number) => {
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock)) {
    throw new Error("区块号必须是整数");
  }
  if (fromBlock < 0 || toBlock < fromBlock) {
    throw new Error("区块范围无效");
  }

  return {
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
  };
};

export const findMaxSupportedInterval = async (
  latestBlock: number,
  probe: (fromBlock: number, toBlock: number) => Promise<boolean>,
  requestedMaxInterval: number = DEFAULT_MAX_PROBE_INTERVAL,
): Promise<IntervalProbeResult> => {
  if (!Number.isSafeInteger(latestBlock) || latestBlock < 0) {
    throw new Error("最新区块号无效");
  }
  if (!Number.isSafeInteger(requestedMaxInterval) || requestedMaxInterval < 1) {
    throw new Error("探测区块间隔必须是正整数");
  }

  const interval = Math.min(requestedMaxInterval, latestBlock + 1);
  try {
    const supported = await probe(latestBlock - interval + 1, latestBlock);
    return {
      supported,
      maxInterval: supported ? interval : 0,
      attempts: 1,
      reachedProbeLimit: supported && interval === requestedMaxInterval,
    };
  } catch (error) {
    return {
      supported: false,
      maxInterval: 0,
      attempts: 1,
      reachedProbeLimit: false,
      stopReason: error instanceof Error ? error.message : "RPC 探测失败，无法确定范围限制",
      ...(error instanceof RpcRangeError && error.limit !== undefined
        ? { reportedMaxInterval: error.limit } : {}),
    };
  }
};

class RpcRangeError extends Error {
  constructor(message: string, readonly limit?: number) {
    super(message);
  }
}

export const probeLogRange = async (
  send: (method: string, params: unknown[]) => Promise<unknown>,
  fromBlock: number,
  toBlock: number,
): Promise<boolean> => {
  const filter = buildLogProbeFilter(fromBlock, toBlock);
  try {
    const logs = await send("eth_getLogs", [filter]);
    if (!Array.isArray(logs)) throw new Error("RPC 返回的日志结果不是数组");
    return true;
  } catch (error) {
    // ethers wraps the server error; never classify its serialized request payload.
    const outer = error as { error?: { message?: string; code?: number }; message?: string; code?: string | number; info?: { responseStatus?: string } } | null;
    const message = outer?.error?.message ?? outer?.message ?? "未知 RPC 错误";
    const code = outer?.error?.code ?? outer?.code;
    const status = outer?.info?.responseStatus ?? "";
    if (/429|too many requests|rate.?limit|requests per|quota|compute units/i.test(message + status)) {
      throw new Error("请求被限流或额度不足；无法据此确定区块范围限制。请稍后重试。");
    }
    if (/timeout|timed out/i.test(message) || code === "TIMEOUT") {
      throw new Error("请求超时；无法据此确定区块范围限制。");
    }
    if (/too many (results|logs)|more than .*(results|logs)|response (size|too large)|log response size|result.*(limit|exceed)/i.test(message)) {
      throw new Error("返回日志数量或响应大小超限，这不代表区块范围上限。");
    }
    if (code === -32005 && /^limit exceeded[.!]?$/i.test(message.trim())) {
      throw new Error("RPC 返回 -32005: limit exceeded，无法确定具体限制；可能是接口策略或配额限制，不能据此判断最大区块范围。");
    }
    if (code === -32601) throw new Error("RPC 未提供 eth_getLogs 方法。");
    // Parse only explicit block-count limits, never log counts or generic -32005 errors.
    const limitMatch = message.match(/(?:maximum|max)(?: allowed)? (?:block )?range(?: of)?\s*[:=]?\s*([\d,]+)/i)
      ?? message.match(/(?:limited to|maximum of|at most|up to) (?:a )?([\d,]+) blocks?/i);
    if (limitMatch) {
      const limit = Number(limitMatch[1].replaceAll(",", ""));
      throw new RpcRangeError(message, Number.isSafeInteger(limit) && limit > 0 ? limit : undefined);
    }
    if (/block range|range of blocks|blocks? range/i.test(message)) {
      throw new RpcRangeError(message);
    }
    throw new Error(`本次请求未能验证日志查询能力：${message}`);
  }
};
