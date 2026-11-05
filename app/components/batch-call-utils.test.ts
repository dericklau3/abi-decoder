import { describe, expect, test } from "bun:test";

import {
  getWritableFunctionInfos,
  getPrivateKeyAddressPreviews,
  parsePrivateKeyLines,
  prepareBatchCallArgs,
} from "./batch-call-utils";

const sampleAbi = [
  "function name() view returns (string)",
  "function setNumber(uint256 newNumber)",
  "function mint(address to) payable",
];

describe("batch-call-utils", () => {
  test("parses private keys one per line and adds missing prefix", () => {
    expect(
      parsePrivateKeyLines(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n0x1111111111111111111111111111111111111111111111111111111111111111",
      ),
    ).toEqual([
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    ]);
  });

  test("rejects empty private key input", () => {
    expect(() => parsePrivateKeyLines(" \n ")).toThrow("请至少填写一个私钥");
  });

  test("rejects malformed or duplicate private keys before sending", () => {
    const valid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(() => parsePrivateKeyLines("abc")).toThrow("私钥格式无效");
    expect(() => parsePrivateKeyLines(valid + "\n0x" + valid)).toThrow("重复私钥");
    expect(() => parsePrivateKeyLines(Array(101).fill(valid).join("\n"))).toThrow("最多支持 100");
  });

  test("previews addresses for valid private keys", () => {
    expect(
      getPrivateKeyAddressPreviews(
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
    ).toEqual([
      {
        index: 0,
        address: "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c",
      },
    ]);
  });

  test("returns line-level errors for invalid private key previews", () => {
    expect(getPrivateKeyAddressPreviews("not-a-key")).toEqual([
      {
        index: 0,
        error: "私钥格式无效",
      },
    ]);
  });

  test("only returns nonpayable and payable functions", () => {
    expect(getWritableFunctionInfos(sampleAbi).map((item) => item.signature)).toEqual([
      "setNumber(uint256)",
      "mint(address)",
    ]);
  });

  test("prepares parsed args and payable override", () => {
    const fn = getWritableFunctionInfos(sampleAbi).find(
      (item) => item.signature === "mint(address)",
    );

    expect(
      prepareBatchCallArgs(
        fn!,
        ["000000000000000000000000000000000000dead"],
        "0.01",
      ),
    ).toEqual([
      "0x000000000000000000000000000000000000dEaD",
      { value: 10000000000000000n },
    ]);
  });
});
