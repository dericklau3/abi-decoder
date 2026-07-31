import { describe, expect, test } from "bun:test";

import {
  encodeManualTransactionData,
  parseManualFunctionSignature,
} from "./transaction-encoder-utils";

describe("transaction-encoder-utils", () => {
  test("parses function signatures into selector and parameter types", () => {
    expect(parseManualFunctionSignature("transfer(address,uint256)")).toEqual({
      selector: "0xa9059cbb",
      params: [
        { type: "address" },
        { type: "uint256" },
      ],
    });
  });

  test("parses tuple parameter types from function signatures", () => {
    expect(parseManualFunctionSignature("setUser((address,uint256))")).toEqual({
      selector: "0x095ede30",
      params: [{ type: "(address,uint256)" }],
    });
  });

  test("encodes full calldata from a function signature and typed values", () => {
    const encoded = encodeManualTransactionData({
      functionSignature: "transfer(address,uint256)",
      params: [
        {
          type: "address",
          value: "000000000000000000000000000000000000dead",
        },
        { type: "uint256", value: "5" },
      ],
    });

    expect(encoded).toEqual({
      selector: "0xa9059cbb",
      payload:
        "0x000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000000005",
      data:
        "0xa9059cbb000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000000005",
    });
  });

  test("encodes full calldata from a manually supplied selector", () => {
    const encoded = encodeManualTransactionData({
      selector: "12345678",
      params: [{ type: "bool", value: "true" }],
    });

    expect(encoded.selector).toBe("0x12345678");
    expect(encoded.data).toBe(
      "0x123456780000000000000000000000000000000000000000000000000000000000000001",
    );
  });

  test("encodes payload only when selector and signature are empty", () => {
    const encoded = encodeManualTransactionData({
      params: [{ type: "uint256[]", value: '["1","2"]' }],
    });

    expect(encoded.selector).toBe("");
    expect(encoded.data).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
    );
    expect(encoded.payload).toBe(encoded.data);
  });

  test("encodes integer values with display units", () => {
    const encoded = encodeManualTransactionData({
      selector: "0x12345678",
      params: [{ type: "uint256", value: "1.5", unit: "ether" }],
    });

    expect(encoded.payload).toBe(
      "0x00000000000000000000000000000000000000000000000014d1120d7b160000",
    );
  });

  test("rejects malformed selectors", () => {
    expect(() =>
      encodeManualTransactionData({
        selector: "0x1234",
        params: [],
      }),
    ).toThrow("selector 必须是 4-byte hex");
  });
});
