import { describe, expect, test } from "bun:test";

import {
  bytes64AddressToHex,
  bytes64HexToAddress,
  bytes64HexToDecimal,
  bytes64HexToText,
  decimalToBytes64Hex,
  decodeBase64ToUtf8,
  encodeUtf8ToBase64,
  textToBytes64Hex,
} from "./address-converter-utils";

describe("address-converter-utils", () => {
  test("encodes utf-8 text to base64", () => {
    expect(encodeUtf8ToBase64("hello world")).toBe("aGVsbG8gd29ybGQ=");
  });

  test("supports unicode when encoding to base64", () => {
    expect(encodeUtf8ToBase64("你好，EVM")).toBe("5L2g5aW977yMRVZN");
  });

  test("decodes base64 to utf-8 text", () => {
    expect(decodeBase64ToUtf8("aGVsbG8gd29ybGQ=")).toBe("hello world");
  });

  test("trims whitespace before decoding base64", () => {
    expect(decodeBase64ToUtf8("  SGVsbG8=  ")).toBe("Hello");
  });

  test("throws a readable error for invalid base64 input", () => {
    expect(() => decodeBase64ToUtf8("%%%")).toThrow("请输入有效的 Base64");
  });

  test("encodes decimal to bytes64 hex", () => {
    expect(decimalToBytes64Hex("255")).toBe(`0x${"0".repeat(126)}ff`);
  });

  test("decodes bytes64 hex to decimal", () => {
    expect(bytes64HexToDecimal(`0x${"0".repeat(126)}ff`)).toBe("255");
  });

  test("encodes text to bytes64 hex with zero padding", () => {
    expect(textToBytes64Hex("hello")).toBe(
      `0x68656c6c6f${"0".repeat(118)}`,
    );
  });

  test("decodes bytes64 hex to text by trimming trailing zeros", () => {
    expect(bytes64HexToText(`0x68656c6c6f${"0".repeat(118)}`)).toBe("hello");
  });

  test("encodes address to bytes64 hex with left padding", () => {
    expect(
      bytes64AddressToHex("0x000000000000000000000000000000000000dEaD"),
    ).toBe(`0x${"0".repeat(88)}000000000000000000000000000000000000dead`);
  });

  test("decodes bytes64 hex to checksum address", () => {
    expect(
      bytes64HexToAddress(
        `0x${"0".repeat(88)}000000000000000000000000000000000000dead`,
      ),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("rejects text input longer than 64 bytes", () => {
    expect(() => textToBytes64Hex("a".repeat(65))).toThrow(
      "UTF-8 字节长度不能超过 64",
    );
  });

  test("rejects bytes64 input that is too long for decimal decoding", () => {
    expect(() => bytes64HexToDecimal(`0x${"1".repeat(130)}`)).toThrow(
      "Hex 长度必须等于 bytes64（128 个 hex 字符）",
    );
  });

  test("rejects bytes64 input with non-zero prefix for address decoding", () => {
    expect(() =>
      bytes64HexToAddress(`0x${"1".repeat(88)}000000000000000000000000000000000000dead`),
    ).toThrow("该 bytes64 不是有效的地址编码");
  });
});
