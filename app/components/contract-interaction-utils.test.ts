import { describe, expect, test } from "bun:test";

import {
  appendTransactionOverrides,
  encodeFunctionCalldata,
  extractContractErrorMessage,
  normalizeAddressInput,
  parseArgumentValue,
} from "./contract-interaction-utils";

describe("contract-interaction-utils", () => {
  test("parses uint arguments as bigint", () => {
    expect(parseArgumentValue("uint256", "5")).toBe(5n);
  });

  test("parses address arguments with checksum", () => {
    expect(
      parseArgumentValue("address", "000000000000000000000000000000000000dead"),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("parses array arguments from json", () => {
    expect(parseArgumentValue("uint256[]", "[\"1\", \"2\"]")).toEqual([1n, 2n]);
  });

  test("preserves string whitespace", () => {
    expect(parseArgumentValue("string", " hello ")).toBe(" hello ");
  });

  test("extracts nested wallet error messages", () => {
    expect(
      extractContractErrorMessage({
        info: { error: { message: "execution reverted: Ownable: caller is not the owner" } },
      }),
    ).toBe("execution reverted: Ownable: caller is not the owner");
  });

  test("normalizes addresses by adding missing prefix", () => {
    expect(normalizeAddressInput("abc")).toBe("0xabc");
  });

  test("does not append overrides for nonpayable functions", () => {
    expect(appendTransactionOverrides([1n, "hello"], "nonpayable", "0.01")).toEqual([
      1n,
      "hello",
    ]);
  });

  test("does not append overrides when payable value is empty", () => {
    expect(appendTransactionOverrides(["0xabc"], "payable", "   ")).toEqual([
      "0xabc",
    ]);
  });

  test("appends value override only for payable functions with value", () => {
    expect(appendTransactionOverrides([], "payable", "0.01")).toEqual([
      { value: "0.01" },
    ]);
  });

  test("encodes calldata for a write function with arguments", () => {
    const abi = ["function setNumber(uint256 newNumber)"];

    expect(
      encodeFunctionCalldata(abi, "setNumber(uint256)", [{ type: "uint256" }], [
        "256",
      ]),
    ).toBe(
      "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000100",
    );
  });

  test("encodes selector-only calldata for a write function without arguments", () => {
    const abi = ["function increment()"];

    expect(encodeFunctionCalldata(abi, "increment()", [], [])).toBe("0xd09de08a");
  });
});
