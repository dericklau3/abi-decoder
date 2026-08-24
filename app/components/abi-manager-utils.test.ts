import { describe, expect, test } from "bun:test";

import {
  hasDuplicateAbiName,
  normalizeSavedAbiList,
  upsertSavedAbiByName,
} from "./abi-manager-utils";

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

  test("replaces an ABI with the same trimmed name and keeps its position", () => {
    const result = upsertSavedAbiByName(savedAbis, {
      name: "  ERC20  ",
      abi: '[{"type":"function","name":"balanceOf"}]',
    });

    expect(result).toEqual({
      abiList: [
        { name: "ERC20", abi: '[{"type":"function","name":"balanceOf"}]' },
        { name: "NodeNft", abi: "[{}]" },
      ],
      index: 0,
      replaced: true,
    });
  });

  test("appends an ABI when no saved ABI has the same name", () => {
    const result = upsertSavedAbiByName(savedAbis, {
      name: "Vault",
      abi: "[{}]",
    });

    expect(result).toEqual({
      abiList: [
        { name: "ERC20", abi: "[]" },
        { name: "NodeNft", abi: "[{}]" },
        { name: "Vault", abi: "[{}]" },
      ],
      index: 2,
      replaced: false,
    });
  });
});
