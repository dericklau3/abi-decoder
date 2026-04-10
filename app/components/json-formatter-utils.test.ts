import { describe, expect, test } from "bun:test";

import {
  formatJsonInput,
  serializeJsonValueForCopy,
} from "./json-formatter-utils";

describe("json-formatter-utils", () => {
  test("formats minified json with two-space indentation", () => {
    const result = formatJsonInput('{"user":{"name":"alice"},"enabled":true}');

    expect(result.value).toEqual({
      user: { name: "alice" },
      enabled: true,
    });
    expect(result.pretty).toBe(`{
  "user": {
    "name": "alice"
  },
  "enabled": true
}`);
  });

  test("throws a readable error for invalid json", () => {
    expect(() => formatJsonInput('{"user":}')).toThrow(
      "JSON 格式错误",
    );
  });

  test("serializes string values for copy without quotes", () => {
    expect(serializeJsonValueForCopy("alice")).toBe("alice");
  });

  test("serializes boolean and null values for copy", () => {
    expect(serializeJsonValueForCopy(true)).toBe("true");
    expect(serializeJsonValueForCopy(false)).toBe("false");
    expect(serializeJsonValueForCopy(null)).toBe("null");
  });

  test("serializes arrays and objects for copy as formatted json", () => {
    expect(serializeJsonValueForCopy([1, "two", { active: true }])).toBe(`[
  1,
  "two",
  {
    "active": true
  }
]`);

    expect(serializeJsonValueForCopy({
      user: "alice",
      enabled: true,
    })).toBe(`{
  "user": "alice",
  "enabled": true
}`);
  });
});
