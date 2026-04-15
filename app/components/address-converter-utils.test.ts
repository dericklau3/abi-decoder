import { describe, expect, test } from "bun:test";

import {
  bytes32AddressToHex,
  bytes32HexToAddress,
  bytes32HexToDecimal,
  bytes32HexToText,
  decimalToBytes32Hex,
  decodeBase64ToUtf8,
  encodeUtf8ToBase64,
  textToBytes32Hex,
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

  test("encodes decimal to bytes32 hex", () => {
    expect(decimalToBytes32Hex("255")).toBe(`0x${"0".repeat(62)}ff`);
  });

  test("decodes bytes32 hex to decimal", () => {
    expect(bytes32HexToDecimal(`0x${"0".repeat(62)}ff`)).toBe("255");
  });

  test("encodes text to bytes32 hex with zero padding", () => {
    expect(textToBytes32Hex("hello")).toBe(
      `0x68656c6c6f${"0".repeat(54)}`,
    );
  });

  test("decodes bytes32 hex to text by trimming trailing zeros", () => {
    expect(bytes32HexToText(`0x68656c6c6f${"0".repeat(54)}`)).toBe("hello");
  });

  test("encodes address to bytes32 hex with left padding", () => {
    expect(
      bytes32AddressToHex("0x000000000000000000000000000000000000dEaD"),
    ).toBe(`0x${"0".repeat(24)}000000000000000000000000000000000000dead`);
  });

  test("decodes bytes32 hex to checksum address", () => {
    expect(
      bytes32HexToAddress(
        `0x${"0".repeat(24)}000000000000000000000000000000000000dead`,
      ),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("rejects text input longer than 32 bytes", () => {
    expect(() => textToBytes32Hex("a".repeat(33))).toThrow(
      "UTF-8 字节长度不能超过 32",
    );
  });

  test("rejects bytes32 input that is too long for decimal decoding", () => {
    expect(() => bytes32HexToDecimal(`0x${"1".repeat(66)}`)).toThrow(
      "Hex 长度必须等于 bytes32（64 个 hex 字符）",
    );
  });

  test("rejects bytes32 input with non-zero prefix for address decoding", () => {
    expect(() =>
      bytes32HexToAddress(`0x${"1".repeat(24)}000000000000000000000000000000000000dead`),
    ).toThrow("该 bytes32 不是有效的地址编码");
  });
});
