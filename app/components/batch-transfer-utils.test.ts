import { describe, expect, test } from "bun:test";

import {
  buildBatchTransferRequest,
  buildTokenApprovalRequest,
  parseAddressLines,
  parseAmountLines,
} from "./batch-transfer-utils";

describe("batch-transfer-utils", () => {
  test("parses address lines and ignores blanks", () => {
    expect(
      parseAddressLines(`
        0x000000000000000000000000000000000000dEaD

        0000000000000000000000000000000000000000
      `),
    ).toEqual([
      "0x000000000000000000000000000000000000dEaD",
      "0x0000000000000000000000000000000000000000",
    ]);
  });

  test("parses amount lines with unit decimals", () => {
    expect(parseAmountLines("1\n2.5", 18)).toEqual([
      1000000000000000000n,
      2500000000000000000n,
    ]);
  });

  test("builds an equal eth transfer request with total payable value", () => {
    expect(
      buildBatchTransferRequest({
        assetType: "eth",
        amountMode: "equal",
        receiversText: "0x000000000000000000000000000000000000dEaD\n0x0000000000000000000000000000000000000000",
        singleAmountText: "0.01",
        amountsText: "",
        tokenAddressText: "",
        decimals: 18,
      }),
    ).toEqual({
      method: "batchTransferEth(address[],uint256)",
      args: [
        [
          "0x000000000000000000000000000000000000dEaD",
          "0x0000000000000000000000000000000000000000",
        ],
        10000000000000000n,
      ],
      value: 20000000000000000n,
      summary: {
        receiverCount: 2,
        totalAmount: 20000000000000000n,
      },
    });
  });

  test("builds an erc20 varied transfer request", () => {
    expect(
      buildBatchTransferRequest({
        assetType: "erc20",
        amountMode: "varied",
        receiversText: "0x000000000000000000000000000000000000dEaD",
        singleAmountText: "",
        amountsText: "12.5",
        tokenAddressText: "0x0000000000000000000000000000000000000001",
        decimals: 6,
      }),
    ).toEqual({
      method: "batchTransferErc20(address,address[],uint256[])",
      args: [
        "0x0000000000000000000000000000000000000001",
        ["0x000000000000000000000000000000000000dEaD"],
        [12500000n],
      ],
      value: 0n,
      summary: {
        receiverCount: 1,
        totalAmount: 12500000n,
      },
    });
  });

  test("builds an erc721 transfer request from token ids", () => {
    expect(
      buildBatchTransferRequest({
        assetType: "erc721",
        amountMode: "varied",
        receiversText: "0x000000000000000000000000000000000000dEaD",
        singleAmountText: "",
        amountsText: "42",
        tokenAddressText: "0x0000000000000000000000000000000000000001",
        decimals: 0,
      }),
    ).toEqual({
      method: "batchTransferErc721(address,address[],uint256[])",
      args: [
        "0x0000000000000000000000000000000000000001",
        ["0x000000000000000000000000000000000000dEaD"],
        [42n],
      ],
      value: 0n,
      summary: {
        receiverCount: 1,
        totalAmount: 1n,
      },
    });
  });

  test("rejects mismatched varied rows", () => {
    expect(() =>
      buildBatchTransferRequest({
        assetType: "eth",
        amountMode: "varied",
        receiversText: "0x000000000000000000000000000000000000dEaD",
        singleAmountText: "",
        amountsText: "1\n2",
        tokenAddressText: "",
        decimals: 18,
      }),
    ).toThrow("收款地址数量需要和金额数量一致");
  });

  test("does not build approval request for eth", () => {
    expect(buildTokenApprovalRequest("eth", "0x000000000000000000000000000000000000dEaD")).toBeNull();
  });

  test("builds exact-amount erc20 approval instead of unlimited allowance", () => {
    expect(
      buildTokenApprovalRequest(
        "erc20",
        "0x3b94A2aCAB8544B5d6cc11C0E18dAE2Df845E74A",
        12500000n,
      ),
    ).toEqual({
      method: "approve(address,uint256)",
      args: [
        "0x3b94A2aCAB8544B5d6cc11C0E18dAE2Df845E74A",
        12500000n,
      ],
    });
  });

  test("rejects missing or excessive ERC20 approval amount", () => {
    const spender = "0x3b94A2aCAB8544B5d6cc11C0E18dAE2Df845E74A";
    expect(() => buildTokenApprovalRequest("erc20", spender)).toThrow("确切总金额");
    expect(() => buildTokenApprovalRequest("erc20", spender, 0n)).toThrow("转账金额");
    expect(() => buildTokenApprovalRequest("erc20", spender, -1n)).toThrow("转账金额");
    expect(() => buildTokenApprovalRequest("erc20", spender, 1n << 256n)).toThrow("转账金额");
  });

  test("rejects zero and negative transfer amounts", () => {
    const input = {
      assetType: "erc20" as const,
      amountMode: "equal" as const,
      receiversText: "0x000000000000000000000000000000000000dEaD",
      singleAmountText: "0",
      amountsText: "",
      tokenAddressText: "0x0000000000000000000000000000000000000001",
      decimals: 18,
    };
    expect(() => buildBatchTransferRequest(input)).toThrow("转账金额");
    expect(() => buildBatchTransferRequest({ ...input, singleAmountText: "-1" })).toThrow("转账金额");
  });

  test("builds erc721 approval-for-all request", () => {
    expect(
      buildTokenApprovalRequest(
        "erc721",
        "0x3b94A2aCAB8544B5d6cc11C0E18dAE2Df845E74A",
      ),
    ).toEqual({
      method: "setApprovalForAll(address,bool)",
      args: ["0x3b94A2aCAB8544B5d6cc11C0E18dAE2Df845E74A", true],
    });
  });
});
