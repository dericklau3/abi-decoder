import { describe, expect, test } from "bun:test";

import {
  BEACON_ABI,
  BEACON_SLOT,
  IMPLEMENTATION_SLOT,
  addressFromStorageSlot,
  isEmptySlot,
  normalizeAddressInput,
} from "./proxy-lookup-utils";

describe("proxy-lookup-utils", () => {
  test("exports the ERC-1967 implementation slot", () => {
    expect(IMPLEMENTATION_SLOT).toBe(
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    );
  });

  test("exports the ERC-1967 beacon slot", () => {
    expect(BEACON_SLOT).toBe(
      "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
    );
  });

  test("exports the standard beacon implementation ABI", () => {
    expect(BEACON_ABI).toEqual(["function implementation() view returns (address)"]);
  });

  test("normalizes an address with a missing 0x prefix", () => {
    expect(
      normalizeAddressInput("000000000000000000000000000000000000dead"),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("normalizes whitespace around an address", () => {
    expect(
      normalizeAddressInput("  0x000000000000000000000000000000000000dEaD  "),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("returns an empty string for empty address input", () => {
    expect(normalizeAddressInput("   ")).toBe("");
  });

  test("rejects invalid address input", () => {
    expect(() => normalizeAddressInput("0x1234")).toThrow("请输入有效的地址");
  });

  test("detects empty bytes32 storage slots", () => {
    expect(isEmptySlot(`0x${"0".repeat(64)}`)).toBe(true);
  });

  test("detects non-empty bytes32 storage slots", () => {
    expect(
      isEmptySlot(`0x${"0".repeat(24)}000000000000000000000000000000000000dead`),
    ).toBe(false);
  });

  test("extracts a checksummed address from a storage slot", () => {
    expect(
      addressFromStorageSlot(
        `0x${"0".repeat(24)}000000000000000000000000000000000000dead`,
      ),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("rejects malformed storage slot values", () => {
    expect(() => addressFromStorageSlot("0x1234")).toThrow(
      "Storage slot 必须是 bytes32",
    );
  });

  test("rejects storage slot values with non-hex characters", () => {
    expect(() => addressFromStorageSlot(`0x${"z".repeat(64)}`)).toThrow(
      "Storage slot 必须是有效的 hex",
    );
  });
});
