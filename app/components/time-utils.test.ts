import { describe, expect, test } from "bun:test";

import {
  CHAIN_TIME_CONFIGS,
  EASTERN_TIME_ZONE,
  SHANGHAI_TIME_ZONE,
  blockNumberToRpcQuantity,
  estimateFutureBlockForTimestamp,
  estimateFutureTimestampForBlock,
  formatTimestampSecondsInZone,
  isFutureTimestamp,
  parseTimeText,
  parseBlockHeightInput,
  rpcQuantityToBigInt,
  timeTextToTimestampSeconds,
} from "./time-utils";

describe("time-utils", () => {
  test("formats unix seconds into beijing time", () => {
    expect(formatTimestampSecondsInZone("1710000000", SHANGHAI_TIME_ZONE)).toBe(
      "2024-03-10 00:00:00",
    );
  });

  test("formats unix seconds into eastern time", () => {
    expect(formatTimestampSecondsInZone("1710000000", EASTERN_TIME_ZONE)).toBe(
      "2024-03-09 11:00:00",
    );
  });

  test("parses fixed datetime text", () => {
    expect(parseTimeText("2026-04-15 21:30:45")).toEqual({
      year: 2026,
      month: 4,
      day: 15,
      hour: 21,
      minute: 30,
      second: 45,
    });
  });

  test("converts beijing text to unix seconds", () => {
    expect(
      timeTextToTimestampSeconds("2024-03-10 00:00:00", SHANGHAI_TIME_ZONE),
    ).toBe("1710000000");
  });

  test("converts eastern text to unix seconds", () => {
    expect(
      timeTextToTimestampSeconds("2024-03-09 11:00:00", EASTERN_TIME_ZONE),
    ).toBe("1710000000");
  });

  test("rejects malformed datetime text", () => {
    expect(() => parseTimeText("2024/03/10 00:00:00")).toThrow(
      "请输入 YYYY-MM-DD HH:mm:ss 格式的时间",
    );
  });

  test("keeps default chain timing configuration", () => {
    expect(CHAIN_TIME_CONFIGS.bsc.averageBlockTimeSeconds).toBe(0.45);
    expect(CHAIN_TIME_CONFIGS.ethereum.averageBlockTimeSeconds).toBe(12);
    expect(CHAIN_TIME_CONFIGS.bsc.defaultRpcUrl).toBe(
      "https://bsc-dataseed.binance.org",
    );
  });

  test("parses decimal block height input", () => {
    expect(parseBlockHeightInput(" 123456 ")).toBe(BigInt(123456));
  });

  test("rejects malformed block height input", () => {
    expect(() => parseBlockHeightInput("12.5")).toThrow(
      "请输入有效的区块高度",
    );
  });

  test("converts between bigint block numbers and rpc quantities", () => {
    expect(blockNumberToRpcQuantity(BigInt(123456))).toBe("0x1e240");
    expect(rpcQuantityToBigInt("0x1e240")).toBe(BigInt(123456));
  });

  test("estimates future timestamp from latest block and average block time", () => {
    expect(
      estimateFutureTimestampForBlock({
        latestBlockNumber: BigInt(1000),
        latestTimestamp: 10_000,
        targetBlockNumber: BigInt(1010),
        averageBlockTimeSeconds: 12,
      }),
    ).toBe(10_120);
  });

  test("estimates future block from latest timestamp and average block time", () => {
    expect(
      estimateFutureBlockForTimestamp({
        latestBlockNumber: BigInt(1000),
        latestTimestamp: 10_000,
        targetTimestamp: 10_121,
        averageBlockTimeSeconds: 12,
      }),
    ).toBe(BigInt(1011));
  });

  test("detects whether a timestamp is in the future", () => {
    expect(isFutureTimestamp(101, 100)).toBe(true);
    expect(isFutureTimestamp(100, 100)).toBe(false);
    expect(isFutureTimestamp(99, 100)).toBe(false);
  });
});
