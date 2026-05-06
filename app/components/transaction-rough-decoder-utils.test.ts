import { describe, expect, test } from "bun:test";

import { roughDecodeCalldata } from "./transaction-rough-decoder-utils";

const word = (value: string) => value.padStart(64, "0");
const addressWord = (address: string) => word(address.replace(/^0x/, "").toLowerCase());
const bytesWord = (value: string) => value.replace(/^0x/, "").padEnd(64, "0");

describe("transaction-rough-decoder-utils", () => {
  test("splits selector and static words into address and uint256 candidates", () => {
    const data = [
      "0x12345678",
      addressWord("0x000000000000000000000000000000000000dead"),
      word("2a"),
    ].join("");

    const decoded = roughDecodeCalldata(data);

    expect(decoded.selector).toBe("0x12345678");
    expect(decoded.words).toHaveLength(2);
    expect(decoded.words[0]).toMatchObject({
      index: 0,
      byteOffset: 0,
      address: "0x000000000000000000000000000000000000dEaD",
      uint256: "57005",
    });
    expect(decoded.words[1]).toMatchObject({
      index: 1,
      byteOffset: 32,
      uint256: "42",
    });
    expect(decoded.staticStructCandidate.fields.map((item) => item.index)).toEqual([0, 1]);
  });

  test("detects dynamic offsets and decodes address arrays", () => {
    const firstAddress = "0x000000000000000000000000000000000000dead";
    const secondAddress = "0x000000000000000000000000000000000000beef";
    const data = [
      "0xaabbccdd",
      word("20"),
      word("02"),
      addressWord(firstAddress),
      addressWord(secondAddress),
    ].join("");

    const decoded = roughDecodeCalldata(data);

    expect(decoded.words[0].dynamicOffset).toEqual({
      byteOffset: 32,
      targetWordIndex: 1,
    });
    expect(decoded.dynamicSegments).toEqual([
      {
        fromWordIndex: 0,
        byteOffset: 32,
        targetWordIndex: 1,
        kind: "address[]",
        length: 2,
        values: [
          "0x000000000000000000000000000000000000dEaD",
          "0x000000000000000000000000000000000000bEEF",
        ],
      },
    ]);
    expect(decoded.staticStructCandidate.fields).toHaveLength(0);
  });

  test("decodes dynamic bytes before falling back to uint arrays", () => {
    const data = [
      "0xaabbccdd",
      word("20"),
      word("05"),
      bytesWord("68656c6c6f"),
    ].join("");

    const decoded = roughDecodeCalldata(data);

    expect(decoded.dynamicSegments).toEqual([
      {
        fromWordIndex: 0,
        byteOffset: 32,
        targetWordIndex: 1,
        kind: "bytes",
        length: 5,
        values: ["0x68656c6c6f", "hello"],
      },
    ]);
  });

  test("keeps static struct candidates readable when a head word points to a struct body", () => {
    const data = [
      "0xaabbccdd",
      word("20"),
      addressWord("0x000000000000000000000000000000000000dead"),
      word("2a"),
    ].join("");

    const decoded = roughDecodeCalldata(data);

    expect(decoded.dynamicSegments[0]).toMatchObject({
      fromWordIndex: 0,
      kind: "struct{}",
      words: [
        expect.objectContaining({ address: "0x000000000000000000000000000000000000dEaD" }),
        expect.objectContaining({ uint256: "42" }),
      ],
    });
  });

  test("accepts calldata without a 0x prefix", () => {
    const decoded = roughDecodeCalldata(`12345678${word("01")}`);

    expect(decoded.selector).toBe("0x12345678");
    expect(decoded.words[0].uint256).toBe("1");
  });

  test("rejects invalid hex input", () => {
    expect(() => roughDecodeCalldata("0xnot-hex")).toThrow("请输入有效的 hex data");
  });
});
