import { describe, expect, test } from "bun:test";

import {
  buildExecutionPlan,
  buildRelationshipCallArgs,
  buildRelationshipGraphLayout,
  buildRelationshipForest,
  exportRelationshipCsv,
  exportRelationshipTxt,
  getAddressFunctionOptions,
  splitGraphAndAvailableWallets,
  validateRelationships,
  type RelationshipRelation,
  type RelationshipWallet,
} from "./relationship-utils";

const wallets: RelationshipWallet[] = [
  { id: "wallet-1", address: "0x0000000000000000000000000000000000000001" },
  { id: "wallet-2", address: "0x0000000000000000000000000000000000000002" },
  { id: "wallet-3", address: "0x0000000000000000000000000000000000000003" },
  { id: "wallet-4", address: "0x0000000000000000000000000000000000000004" },
];

describe("relationship-utils", () => {
  test("builds a level-ordered execution plan with root tasks first", () => {
    const relations: RelationshipRelation[] = [
      { walletId: "wallet-2", inviterId: "wallet-1" },
      { walletId: "wallet-3", inviterId: "wallet-1" },
      { walletId: "wallet-4", inviterId: "wallet-2" },
    ];

    expect(buildExecutionPlan(wallets, relations)).toEqual([
      {
        id: "task-wallet-1",
        walletId: "wallet-1",
        inviterId: null,
        level: 0,
        status: "pending",
        txHash: null,
        error: null,
        transactions: [],
      },
      {
        id: "task-wallet-2",
        walletId: "wallet-2",
        inviterId: "wallet-1",
        level: 1,
        status: "pending",
        txHash: null,
        error: null,
        transactions: [],
      },
      {
        id: "task-wallet-3",
        walletId: "wallet-3",
        inviterId: "wallet-1",
        level: 1,
        status: "pending",
        txHash: null,
        error: null,
        transactions: [],
      },
      {
        id: "task-wallet-4",
        walletId: "wallet-4",
        inviterId: "wallet-2",
        level: 2,
        status: "pending",
        txHash: null,
        error: null,
        transactions: [],
      },
    ]);
  });

  test("builds a nested relationship forest for tree rendering", () => {
    const relations: RelationshipRelation[] = [
      { walletId: "wallet-2", inviterId: "wallet-1" },
      { walletId: "wallet-3", inviterId: "wallet-1" },
      { walletId: "wallet-4", inviterId: "wallet-2" },
    ];

    expect(buildRelationshipForest(wallets, relations)).toEqual([
      {
        wallet: wallets[0],
        level: 0,
        children: [
          {
            wallet: wallets[1],
            level: 1,
            children: [
              {
                wallet: wallets[3],
                level: 2,
                children: [],
              },
            ],
          },
          {
            wallet: wallets[2],
            level: 1,
            children: [],
          },
        ],
      },
    ]);
  });

  test("builds a top-down graph layout with parents centered above children", () => {
    const relations: RelationshipRelation[] = [
      { walletId: "wallet-2", inviterId: "wallet-1" },
      { walletId: "wallet-3", inviterId: "wallet-1" },
      { walletId: "wallet-4", inviterId: "wallet-2" },
    ];

    const layout = buildRelationshipGraphLayout(wallets, relations, {
      nodeWidth: 200,
      nodeHeight: 72,
      horizontalGap: 40,
      verticalGap: 80,
      padding: 20,
    });
    const byId = new Map(layout.nodes.map((node) => [node.wallet.id, node]));

    expect(layout.edges).toEqual([
      { fromWalletId: "wallet-1", toWalletId: "wallet-2" },
      { fromWalletId: "wallet-2", toWalletId: "wallet-4" },
      { fromWalletId: "wallet-1", toWalletId: "wallet-3" },
    ]);
    expect(byId.get("wallet-1")?.y).toBe(20);
    expect(byId.get("wallet-2")?.y).toBe(172);
    expect(byId.get("wallet-4")?.y).toBe(324);
    expect(byId.get("wallet-1")?.x).toBe(140);
    expect(byId.get("wallet-2")?.x).toBe(20);
    expect(byId.get("wallet-3")?.x).toBe(260);
  });

  test("keeps isolated wallets in the draggable side list", () => {
    const result = splitGraphAndAvailableWallets(wallets, [
      { walletId: "wallet-2", inviterId: "wallet-1" },
    ]);

    expect(result.graphWallets.map((wallet) => wallet.id)).toEqual([
      "wallet-1",
      "wallet-2",
    ]);
    expect(result.availableWallets.map((wallet) => wallet.id)).toEqual([
      "wallet-3",
      "wallet-4",
    ]);
  });

  test("uses the first wallet as the initial graph root when there are no relations", () => {
    const result = splitGraphAndAvailableWallets(wallets, []);

    expect(result.graphWallets.map((wallet) => wallet.id)).toEqual(["wallet-1"]);
    expect(result.availableWallets.map((wallet) => wallet.id)).toEqual([
      "wallet-2",
      "wallet-3",
      "wallet-4",
    ]);
  });

  test("detects arbitrary-depth relationship cycles", () => {
    const result = validateRelationships(wallets, [
      { walletId: "wallet-2", inviterId: "wallet-1" },
      { walletId: "wallet-3", inviterId: "wallet-2" },
      { walletId: "wallet-1", inviterId: "wallet-3" },
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("存在循环关系：wallet-1 -> wallet-3 -> wallet-2 -> wallet-1");
  });

  test("detects invalid and duplicate wallet addresses", () => {
    const result = validateRelationships(
      [
        { id: "wallet-1", address: "0x0000000000000000000000000000000000000001" },
        { id: "wallet-2", address: "bad" },
        { id: "wallet-3", address: "0x0000000000000000000000000000000000000001" },
      ],
      [],
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("wallet-2 地址格式无效");
    expect(result.errors).toContain("wallet-3 与 wallet-1 地址重复");
  });

  test("exports addresses without private keys", () => {
    const relations: RelationshipRelation[] = [
      { walletId: "wallet-2", inviterId: "wallet-1" },
    ];

    expect(exportRelationshipTxt(wallets.slice(0, 2))).toBe(
      "0x0000000000000000000000000000000000000001\n0x0000000000000000000000000000000000000002",
    );
    expect(exportRelationshipCsv(wallets.slice(0, 2), relations)).toBe(
      [
        "index,address,inviter",
        "1,0x0000000000000000000000000000000000000001,ROOT",
        "2,0x0000000000000000000000000000000000000002,0x0000000000000000000000000000000000000001",
      ].join("\n"),
    );
  });

  test("finds writable ABI functions with one or more address inputs", () => {
    expect(
      getAddressFunctionOptions(
        JSON.stringify([
          {
            type: "function",
            name: "depositAndBind",
            inputs: [
              { name: "amount", type: "uint256" },
              { name: "inviter", type: "address" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
          {
            type: "function",
            name: "setPair",
            inputs: [
              { name: "a", type: "address" },
              { name: "b", type: "address" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ]),
      ),
    ).toEqual([
      {
        name: "depositAndBind",
        signature: "depositAndBind(uint256,address)",
        inputs: [
          { name: "amount", type: "uint256" },
          { name: "inviter", type: "address" },
        ],
        stateMutability: "nonpayable",
      },
      {
        name: "setPair",
        signature: "setPair(address,address)",
        inputs: [
          { name: "a", type: "address" },
          { name: "b", type: "address" },
        ],
        stateMutability: "nonpayable",
      },
    ]);
  });

  test("builds call args by injecting inviter into the selected address input", () => {
    const fn = getAddressFunctionOptions(
      JSON.stringify([
        {
          type: "function",
          name: "depositAndBind",
          inputs: [
            { name: "amount", type: "uint256" },
            { name: "inviter", type: "address" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ]),
    )[0];

    expect(
      buildRelationshipCallArgs({
        fn,
        inviterInputIndex: 1,
        fixedInputs: { 0: "1000000000000000000" },
        inviterAddress: "0x0000000000000000000000000000000000000001",
      }),
    ).toEqual([1000000000000000000n, "0x0000000000000000000000000000000000000001"]);
  });

  test("builds call args with integer display units", () => {
    const fn = getAddressFunctionOptions(
      JSON.stringify([
        {
          type: "function",
          name: "depositAndBind",
          inputs: [
            { name: "amount", type: "uint256" },
            { name: "inviter", type: "address" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ]),
    )[0];

    expect(
      buildRelationshipCallArgs({
        fn,
        inviterInputIndex: 1,
        fixedInputs: { 0: "1" },
        fixedUnits: { 0: "ether" },
        inviterAddress: "0x0000000000000000000000000000000000000001",
      }),
    ).toEqual([1000000000000000000n, "0x0000000000000000000000000000000000000001"]);
  });
});
