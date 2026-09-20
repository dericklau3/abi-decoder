import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MAX_PROBE_INTERVAL,
  buildLogProbeFilter,
  findMaxSupportedInterval,
  normalizeRpcUrl,
} from "./rpc-check-utils";

describe("rpc-check-utils", () => {
  test("normalizes an HTTP RPC URL", () => {
    expect(normalizeRpcUrl("  https://rpc.example.com  ")).toBe(
      "https://rpc.example.com",
    );
  });

  test("rejects an empty or non-HTTP RPC URL", () => {
    expect(() => normalizeRpcUrl("   ")).toThrow("请输入 RPC URL");
    expect(() => normalizeRpcUrl("ws://rpc.example.com")).toThrow(
      "RPC URL 需要是 http(s) URL",
    );
  });

  test("builds a broad eth_getLogs filter with hexadecimal block tags", () => {
    expect(buildLogProbeFilter(16, 31)).toEqual({
      fromBlock: "0x10",
      toBlock: "0x1f",
    });
  });

  test("finds the largest supported interval with exponential probing and binary search", async () => {
    const probedIntervals: number[] = [];
    const result = await findMaxSupportedInterval(
      10_000,
      async (fromBlock, toBlock) => {
        const interval = toBlock - fromBlock + 1;
        probedIntervals.push(interval);
        return interval <= 5;
      },
      16,
    );

    expect(result).toEqual({
      supported: true,
      maxInterval: 5,
      attempts: probedIntervals.length,
      reachedProbeLimit: false,
    });
    expect(probedIntervals).toEqual([1, 2, 4, 8, 6, 5]);
  });

  test("reports an unsupported RPC when even a one-block log query fails", async () => {
    const result = await findMaxSupportedInterval(
      10_000,
      async () => false,
      DEFAULT_MAX_PROBE_INTERVAL,
    );

    expect(result).toEqual({
      supported: false,
      maxInterval: 0,
      attempts: 1,
      reachedProbeLimit: false,
    });
  });

  test("marks a result as capped when every interval up to the probe limit works", async () => {
    const result = await findMaxSupportedInterval(
      10_000,
      async () => true,
      4,
    );

    expect(result).toEqual({
      supported: true,
      maxInterval: 4,
      attempts: 3,
      reachedProbeLimit: true,
    });
  });

  test("does not confuse reaching the chain start with reaching the probe limit", async () => {
    const result = await findMaxSupportedInterval(
      2,
      async () => true,
      DEFAULT_MAX_PROBE_INTERVAL,
    );

    expect(result).toEqual({
      supported: true,
      maxInterval: 3,
      attempts: 3,
      reachedProbeLimit: false,
    });
  });
});
