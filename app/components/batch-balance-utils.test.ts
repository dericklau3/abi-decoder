import { describe, expect, test } from "bun:test";

import { parseBalanceAddressInput } from "./batch-balance-utils";

describe("batch-balance-utils", () => {
  test("parses addresses separated by newlines commas and spaces", () => {
    expect(
      parseBalanceAddressInput(`
        0x000000000000000000000000000000000000dEaD,
        0000000000000000000000000000000000000000
        0x0000000000000000000000000000000000000001
      `),
    ).toEqual([
      "0x000000000000000000000000000000000000dEaD",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000001",
    ]);
  });

  test("deduplicates addresses by checksum value", () => {
    expect(
      parseBalanceAddressInput(`
        0x000000000000000000000000000000000000dead
        0x000000000000000000000000000000000000dEaD
      `),
    ).toEqual(["0x000000000000000000000000000000000000dEaD"]);
  });

  test("rejects empty input", () => {
    expect(() => parseBalanceAddressInput(" \n ")).toThrow(
      "请至少输入一个 EVM 地址",
    );
  });

  test("rejects invalid addresses with row position", () => {
    expect(() => parseBalanceAddressInput("0x123")).toThrow(
      "第 1 个地址格式无效",
    );
  });
});
