import { describe, expect, test } from "bun:test";

import {
  buildLogProbeFilter,
  findMaxSupportedInterval,
  normalizeRpcUrl,
  probeLogRange,
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

  test("checks 100000 blocks in a single request", async () => {
    const ranges: number[][] = [];
    const result = await findMaxSupportedInterval(200000, async (from, to) => {
      ranges.push([from, to]);
      return true;
    });
    expect(ranges).toEqual([[100001, 200000]]);
    expect(result).toMatchObject({ supported: true, maxInterval: 100000, attempts: 1, reachedProbeLimit: true });
  });

  test("clamps the single request to chain history", async () => {
    const ranges: number[][] = [];
    const result = await findMaxSupportedInterval(2, async (from, to) => {
      ranges.push([from, to]);
      return true;
    });
    expect(ranges).toEqual([[0, 2]]);
    expect(result).toMatchObject({ maxInterval: 3, attempts: 1, reachedProbeLimit: false });
  });

  test.each([
    ["block range exceeds maximum allowed range of 5000 blocks", 5000],
    ["exceed maximum block range: 50,000", 50000],
    ["eth_getLogs is limited to a 10,000 blocks range", 10000],
    ["block range too large", undefined],
  ])("reads the explicit range limit from %s without further requests", async (message, limit) => {
    const result = await findMaxSupportedInterval(200000, (from, to) => probeLogRange(async () => {
      throw { error: { code: -32602, message } };
    }, from, to));
    expect(result.attempts).toBe(1);
    expect(result.supported).toBe(false);
    expect(result.maxInterval).toBe(0);
    expect(result.reportedMaxInterval).toBe(limit);
    expect(result.stopReason).toContain(message);
  });

});

// RPC failures must not become a fabricated block-range limit.
describe("log probe failures", () => {
  test.each([
    { code: -32005, message: "rate limit exceeded" },
    { code: -32005, message: "limit exceeded" },
    { code: -32005, message: "query returned more than 10000 results" },
    { code: -32601, message: "method not found" },
    { code: -32602, message: "invalid params: address required" },
    { code: "TIMEOUT", message: "request timeout" },
    { code: "SERVER_ERROR", message: "HTTP 429 Too Many Requests" },
  ])("keeps $message separate from range rejection", async (failure) => {
    await expect(probeLogRange(async () => { throw failure; }, 1, 2)).rejects.toThrow();
  });

  test("rejects malformed successful log responses", async () => {
    await expect(probeLogRange(async () => null, 1, 2)).rejects.toThrow();
  });

  test("does not claim unsupported when the first request times out", async () => {
    const result = await findMaxSupportedInterval(100, async () => { throw new Error("超时"); });
    expect(result.maxInterval).toBe(0);
    expect(result.stopReason).toContain("超时");
  });

});

 test("BNB generic limit exceeded does not establish a block-range limit", async () => {
   const result = await findMaxSupportedInterval(123008000, (from, to) => probeLogRange(async () => {
     throw { error: { code: -32005, message: "limit exceeded" } };
   }, from, to));
   expect(result.stopReason).toContain("无法确定");
   expect(result.attempts).toBe(1);
   expect(result.maxInterval).toBe(0);
 });
