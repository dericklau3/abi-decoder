export const DEFAULT_MAX_PROBE_INTERVAL = 10_000;

export type IntervalProbeResult = {
  supported: boolean;
  maxInterval: number;
  attempts: number;
  reachedProbeLimit: boolean;
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
  if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock)) {
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
  if (!Number.isInteger(latestBlock) || latestBlock < 0) {
    throw new Error("最新区块号无效");
  }
  if (!Number.isInteger(requestedMaxInterval) || requestedMaxInterval < 1) {
    throw new Error("探测区块间隔必须是正整数");
  }

  const maxInterval = Math.min(requestedMaxInterval, latestBlock + 1);
  const reachesRequestedProbeLimit = requestedMaxInterval <= latestBlock + 1;
  let attempts = 0;

  const probeInterval = async (interval: number) => {
    const fromBlock = latestBlock - interval + 1;
    attempts += 1;
    return probe(fromBlock, latestBlock);
  };

  if (!(await probeInterval(1))) {
    return {
      supported: false,
      maxInterval: 0,
      attempts,
      reachedProbeLimit: false,
    };
  }

  let supportedInterval = 1;
  if (maxInterval === 1) {
    return {
      supported: true,
      maxInterval: 1,
      attempts,
      reachedProbeLimit: reachesRequestedProbeLimit,
    };
  }

  let failedInterval = Math.min(2, maxInterval);
  while (true) {
    if (await probeInterval(failedInterval)) {
      supportedInterval = failedInterval;
      if (failedInterval === maxInterval) {
        return {
          supported: true,
          maxInterval: supportedInterval,
          attempts,
          reachedProbeLimit: reachesRequestedProbeLimit,
        };
      }
      failedInterval = Math.min(failedInterval * 2, maxInterval);
      continue;
    }
    break;
  }

  let left = supportedInterval + 1;
  let right = failedInterval - 1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (await probeInterval(middle)) {
      supportedInterval = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return {
    supported: true,
    maxInterval: supportedInterval,
    attempts,
    reachedProbeLimit: false,
  };
};
