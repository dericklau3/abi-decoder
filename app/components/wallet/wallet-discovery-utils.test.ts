import { describe, expect, test } from "bun:test";

import { shouldRequestWalletDiscovery } from "./wallet-discovery-utils";

describe("wallet-discovery-utils", () => {
  test("does not request wallet discovery while the wallet modal is closed", () => {
    expect(
      shouldRequestWalletDiscovery({
        isWalletModalOpen: false,
        hasRequestedDiscovery: false,
      }),
    ).toBe(false);
  });

  test("requests wallet discovery the first time the wallet modal opens", () => {
    expect(
      shouldRequestWalletDiscovery({
        isWalletModalOpen: true,
        hasRequestedDiscovery: false,
      }),
    ).toBe(true);
  });

  test("does not request wallet discovery again after the current modal session already requested it", () => {
    expect(
      shouldRequestWalletDiscovery({
        isWalletModalOpen: true,
        hasRequestedDiscovery: true,
      }),
    ).toBe(false);
  });
});
