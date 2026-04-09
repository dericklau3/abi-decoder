import { describe, expect, test } from "bun:test";

import { getWalletDiscoveryHint } from "./wallet-display-utils";

describe("wallet-display-utils", () => {
  test("prompts the user to install a Web3 wallet when no ERC-6963 wallet is discovered", () => {
    expect(getWalletDiscoveryHint(0)).toBe("未发现可用钱包，请先安装 Web3 钱包插件");
  });

  test("does not show an install prompt when at least one ERC-6963 wallet is discovered", () => {
    expect(getWalletDiscoveryHint(1)).toBe("");
  });
});
