import { describe, expect, test } from "bun:test";

import {
  EASTERN_TIME_ZONE,
  SHANGHAI_TIME_ZONE,
  formatTimestampSecondsInZone,
  parseTimeText,
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
});
