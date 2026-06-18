import { describe, expect, test } from "bun:test";

import { hasDuplicateAbiName, normalizeSavedAbiList } from "./abi-manager-utils";

describe("abi-manager-utils", () => {
  const savedAbis = [
    { name: "ERC20", abi: "[]" },
    { name: "NodeNft", abi: "[{}]" },
  ];

  test("detects duplicate ABI names", () => {
    expect(hasDuplicateAbiName(savedAbis, "NodeNft")).toBe(true);
  });

  test("allows updating the selected ABI with its current name", () => {
    expect(hasDuplicateAbiName(savedAbis, "NodeNft", 1)).toBe(false);
  });

  test("trims names before checking duplicates", () => {
    expect(hasDuplicateAbiName(savedAbis, "  ERC20  ")).toBe(true);
  });

  test("normalizes poisoned saved ABI entries", () => {
    expect(
      normalizeSavedAbiList([
        { name: "ERC20", abi: "[]" },
        { name: { value: "bad" }, abi: "[]" },
        { name: "missing abi" },
        null,
      ]),
    ).toEqual([{ name: "ERC20", abi: "[]" }]);
  });

  test("rejects non-array saved ABI storage values", () => {
    expect(normalizeSavedAbiList({ name: "ERC20", abi: "[]" })).toEqual([]);
  });
});
