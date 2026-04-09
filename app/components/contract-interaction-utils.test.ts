import { describe, expect, test } from "bun:test";

import {
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
});
