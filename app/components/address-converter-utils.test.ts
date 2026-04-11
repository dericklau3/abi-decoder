import { describe, expect, test } from "bun:test";

import {
  decodeBase64ToUtf8,
  encodeUtf8ToBase64,
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
});
