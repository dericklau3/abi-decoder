import { describe, expect, test } from "bun:test";

import {
  formatTokenBalance,
  MAX_BALANCE_ADDRESS_COUNT,
  normalizeErc20TokenAddress,
  parseBalanceAddressInput,
} from "./batch-balance-utils";

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

  test("rejects address lists above the batch limit", () => {
    const addresses = Array.from({ length: MAX_BALANCE_ADDRESS_COUNT + 1 }, (_, index) =>
      `0x${index.toString(16).padStart(40, "0")}`,
    ).join("\n");

    expect(() => parseBalanceAddressInput(addresses)).toThrow(
      `单次最多查询 ${MAX_BALANCE_ADDRESS_COUNT} 个地址`,
    );
  });

  test("normalizes erc20 token address", () => {
    expect(
      normalizeErc20TokenAddress("000000000000000000000000000000000000dEaD"),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("rejects invalid erc20 token address", () => {
    expect(() => normalizeErc20TokenAddress("0x123")).toThrow(
      "请输入有效的 ERC20 合约地址",
    );
  });

  test("formats token balances by decimals", () => {
    expect(formatTokenBalance(123456789n, 6)).toBe("123.456789");
  });

  test("falls back to raw balance for invalid decimals", () => {
    expect(formatTokenBalance(123456789n, -1)).toBe("123456789");
  });
});
