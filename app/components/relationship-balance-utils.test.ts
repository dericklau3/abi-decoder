import { describe, expect, test } from "bun:test";

import { splitRelationshipBalanceBatches } from "./relationship-balance-utils";

describe("relationship-balance-utils", () => {
  test("splits balance queries into batches of at most 100 wallets", () => {
    const wallets = Array.from({ length: 201 }, (_, index) => `wallet-${index + 1}`);

    expect(splitRelationshipBalanceBatches(wallets, 100)).toEqual([
      wallets.slice(0, 100),
      wallets.slice(100, 200),
      wallets.slice(200),
    ]);
  });
});
