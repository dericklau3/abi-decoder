import { describe, expect, test } from "bun:test";

import {
  appendTransactionOverrides,
  COMMON_ERC20_TOKENS_BY_CHAIN,
  createCustomErc20Token,
  encodeFunctionCalldata,
  extractContractErrorMessage,
  getArgumentInputValue,
  hasMissingArgumentInputs,
  isIntegerParamType,
  isUserRejectedWalletRequest,
  mergeErc20TokenOptions,
  normalizeAddressInput,
  parseArgumentValue,
  parseCustomErc20TokenStore,
  parseErc20ApprovalAmount,
  removeCustomErc20Token,
  serializeCustomErc20TokenStore,
  syncErc20ApprovalSpender,
  setArgumentInputValue,
} from "./contract-interaction-utils";

describe("contract-interaction-utils", () => {
  test("parses uint arguments as bigint", () => {
    expect(parseArgumentValue("uint256", "5")).toBe(5n);
  });

  test("parses address arguments with checksum", () => {
    expect(
      parseArgumentValue("address", "000000000000000000000000000000000000dead"),
    ).toBe("0x000000000000000000000000000000000000dEaD");
  });

  test("parses array arguments from json", () => {
    expect(parseArgumentValue("uint256[]", "[\"1\", \"2\"]")).toEqual([1n, 2n]);
  });

  test("does not treat tuple arguments as integer parameters", () => {
    const input = {
      name: "user",
      type: "tuple",
      components: [
        { name: "account", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    };

    expect(isIntegerParamType(input)).toBe(false);
  });

  test("encodes calldata for tuple arguments from abi input definitions", () => {
    const abi = [
      {
        type: "function",
        name: "setUser",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "user",
            type: "tuple",
            components: [
              { name: "account", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        outputs: [],
      },
    ];

    expect(
      encodeFunctionCalldata(
        abi,
        "setUser((address,uint256))",
        [
          {
            name: "user",
            type: "tuple",
            components: [
              { name: "account", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        [
          JSON.stringify({
            account: "000000000000000000000000000000000000dead",
            amount: "5",
          }),
        ],
      ),
    ).toBe(
      "0x095ede30000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000000005",
    );
  });

  test("assembles expanded tuple field inputs for calldata encoding", () => {
    const abi = [
      {
        type: "function",
        name: "setUser",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "user",
            type: "tuple",
            components: [
              { name: "account", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        outputs: [],
      },
    ];
    const inputs = abi[0].inputs;
    let inputValues = {};
    inputValues = setArgumentInputValue(inputValues, "0.0", "000000000000000000000000000000000000dead");
    inputValues = setArgumentInputValue(inputValues, "0.1", "5");

    expect(hasMissingArgumentInputs(inputs, inputValues)).toBe(false);
    expect(getArgumentInputValue(inputs[0], inputValues, "0")).toEqual({
      account: "000000000000000000000000000000000000dead",
      amount: "5",
    });
    expect(
      encodeFunctionCalldata(
        abi,
        "setUser((address,uint256))",
        inputs,
        inputValues,
      ),
    ).toBe(
      "0x095ede30000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000000005",
    );
  });

  test("preserves string whitespace", () => {
    expect(parseArgumentValue("string", " hello ")).toBe(" hello ");
  });

  test("extracts nested wallet error messages", () => {
    expect(
      extractContractErrorMessage({
        info: { error: { message: "execution reverted: Ownable: caller is not the owner" } },
      }),
    ).toBe("execution reverted: Ownable: caller is not the owner");
  });

  test("recognizes rejected wallet requests", () => {
    const error = {
      code: "UNKNOWN_ERROR",
      message: "could not coalesce error",
      error: {
        code: 4001,
        message: "User rejected the request.",
      },
    };

    expect(isUserRejectedWalletRequest(error)).toBe(true);
    expect(extractContractErrorMessage(error)).toBe("用户拒绝了钱包请求");
  });

  test("normalizes addresses by adding missing prefix", () => {
    expect(normalizeAddressInput("abc")).toBe("0xabc");
  });

  test("does not append overrides for nonpayable functions", () => {
    expect(appendTransactionOverrides([1n, "hello"], "nonpayable", "0.01")).toEqual([
      1n,
      "hello",
    ]);
  });

  test("does not append overrides when payable value is empty", () => {
    expect(appendTransactionOverrides(["0xabc"], "payable", "   ")).toEqual([
      "0xabc",
    ]);
  });

  test("appends value override only for payable functions with value", () => {
    expect(appendTransactionOverrides([], "payable", "0.01")).toEqual([
      { value: "0.01" },
    ]);
  });

  test("encodes calldata for a write function with arguments", () => {
    const abi = ["function setNumber(uint256 newNumber)"];

    expect(
      encodeFunctionCalldata(abi, "setNumber(uint256)", [{ type: "uint256" }], [
        "256",
      ]),
    ).toBe(
      "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000100",
    );
  });

  test("encodes integer arguments with selected display units", () => {
    const abi = ["function setNumber(uint256 newNumber)"];

    expect(
      encodeFunctionCalldata(
        abi,
        "setNumber(uint256)",
        [{ type: "uint256" }],
        ["1.5"],
        ["ether"],
      ),
    ).toBe(
      "0x3fb5c1cb00000000000000000000000000000000000000000000000014d1120d7b160000",
    );
  });

  test("rejects fractional wei integer arguments", () => {
    expect(() => parseArgumentValue("uint256", "1.5", "wei")).toThrow(
      "uint256 参数使用 wei 单位时必须是整数",
    );
  });

  test("encodes selector-only calldata for a write function without arguments", () => {
    const abi = ["function increment()"];

    expect(encodeFunctionCalldata(abi, "increment()", [], [])).toBe("0xd09de08a");
  });

  test("parses custom erc20 token storage by chain", () => {
    expect(parseCustomErc20TokenStore("not json")).toEqual({});

    const parsed = parseCustomErc20TokenStore(
      JSON.stringify({
        "56": [
          {
            chainId: 56,
            symbol: "busd",
            address: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
            decimals: 18,
          },
          {
            chainId: 1,
            symbol: "WRONG_CHAIN",
            address: "0x0000000000000000000000000000000000000001",
            decimals: 18,
          },
        ],
      }),
    );

    expect(parsed[56]).toEqual([
      {
        chainId: 56,
        symbol: "BUSD",
        address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
        decimals: 18,
      },
    ]);
    expect(serializeCustomErc20TokenStore(parsed)).toBe(
      JSON.stringify({
        56: [
          {
            chainId: 56,
            symbol: "BUSD",
            address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
            decimals: 18,
          },
        ],
      }),
    );
  });

  test("merges preset and custom erc20 tokens by address", () => {
    const preset = {
      chainId: 56,
      symbol: "USDT",
      address: "0x55d398326f99059ff775485246999027b3197955",
      decimals: 18,
    };
    const custom = {
      chainId: 56,
      symbol: "MYUSDT",
      address: "0x55d398326f99059ff775485246999027b3197955",
      decimals: 18,
    };

    expect(mergeErc20TokenOptions([preset], [custom])).toEqual([
      {
        chainId: 56,
        symbol: "MYUSDT",
        address: "0x55d398326f99059fF775485246999027B3197955",
        decimals: 18,
      },
    ]);
  });

  test("creates custom erc20 tokens from fetched metadata", () => {
    expect(
      createCustomErc20Token({
        chainId: 8453,
        address: "833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        metadata: {
          symbol: " usdc ",
          decimals: 6n,
        },
      }),
    ).toEqual({
      chainId: 8453,
      symbol: "USDC",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
    });

    expect(() =>
      createCustomErc20Token({
        chainId: 8453,
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        metadata: {
          symbol: "BAD",
          decimals: 300n,
        },
      }),
    ).toThrow("Token decimals 必须是 0 到 255 的整数");
  });

  test("parses erc20 approval amounts", () => {
    expect(parseErc20ApprovalAmount("1.5", 6, false)).toBe(1500000n);
    expect(parseErc20ApprovalAmount("", 18, true)).toBe(
      (1n << 256n) - 1n,
    );
    expect(() => parseErc20ApprovalAmount("1", 300, false)).toThrow(
      "Token decimals 必须是 0 到 255 的整数",
    );
  });

  test("syncs quick approval spender while it still matches the previous contract address", () => {
    expect(
      syncErc20ApprovalSpender(
        {
          spender: "0x1111111111111111111111111111111111111111",
          amount: "100",
          useMax: false,
        },
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ),
    ).toEqual({
      spender: "0x2222222222222222222222222222222222222222",
      amount: "100",
      useMax: false,
    });
  });

  test("keeps manually edited quick approval spender when contract address changes", () => {
    expect(
      syncErc20ApprovalSpender(
        {
          spender: "0x3333333333333333333333333333333333333333",
          amount: "100",
          useMax: false,
        },
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ),
    ).toEqual({
      spender: "0x3333333333333333333333333333333333333333",
      amount: "100",
      useMax: false,
    });
  });

  test("keeps quick approval presets scoped to bsc usdt", () => {
    expect(Object.keys(COMMON_ERC20_TOKENS_BY_CHAIN).sort()).toEqual([
      "56",
      "97",
    ]);
    expect(COMMON_ERC20_TOKENS_BY_CHAIN[56]).toEqual([
      {
        chainId: 56,
        symbol: "USDT",
        address: "0x55d398326f99059fF775485246999027B3197955",
        decimals: 18,
      },
    ]);
    expect(COMMON_ERC20_TOKENS_BY_CHAIN[97]).toEqual([
      {
        chainId: 97,
        symbol: "USDT",
        address: "0xa83C8A2162225c0DeD2d288FaF453076682a861C",
        decimals: 18,
      },
    ]);
  });

  test("removes custom erc20 tokens by chain and address", () => {
    const store = {
      56: [
        {
          chainId: 56,
          symbol: "BCF",
          address: "0x7E664A8B349F651A09c3E992F3AaBE7A69E8ED3",
          decimals: 18,
        },
      ],
      8453: [
        {
          chainId: 8453,
          symbol: "USDC",
          address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          decimals: 6,
        },
      ],
    };

    expect(
      removeCustomErc20Token(
        store,
        8453,
        "833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      ),
    ).toEqual({
      56: store[56],
    });
  });
});
