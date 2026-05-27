import { describe, expect, test } from "bun:test";
import { AbiCoder, keccak256, toBeHex, zeroPadValue } from "ethers";

import {
  decodeStorageValue,
  parseStorageLayout,
  resolveStoragePath,
} from "./storage-layout-utils";

const coder = AbiCoder.defaultAbiCoder();

const sampleLayout = {
  storage: [
    {
      astId: 1,
      contract: "Token.sol:Token",
      label: "_balances",
      offset: 0,
      slot: "0",
      type: "t_mapping(t_address,t_uint256)",
    },
    {
      astId: 2,
      contract: "Token.sol:Token",
      label: "_allowances",
      offset: 0,
      slot: "1",
      type: "t_mapping(t_address,t_mapping(t_address,t_uint256))",
    },
    {
      astId: 3,
      contract: "Token.sol:Token",
      label: "_name",
      offset: 0,
      slot: "2",
      type: "t_string_storage",
    },
    {
      astId: 4,
      contract: "Token.sol:Token",
      label: "_roles",
      offset: 0,
      slot: "3",
      type: "t_mapping(t_bytes32,t_struct(RoleData)20_storage)",
    },
    {
      astId: 5,
      contract: "Token.sol:Token",
      label: "_flags",
      offset: 0,
      slot: "4",
      type: "t_bool",
    },
    {
      astId: 6,
      contract: "Token.sol:Token",
      label: "_secondFlag",
      offset: 1,
      slot: "4",
      type: "t_bool",
    },
    {
      astId: 7,
      contract: "Token.sol:Token",
      label: "_numbers",
      offset: 0,
      slot: "5",
      type: "t_array(t_uint256)dyn_storage",
    },
    {
      astId: 10,
      contract: "Token.sol:Token",
      label: "_fixedFlags",
      offset: 0,
      slot: "6",
      type: "t_array(t_bool)4_storage",
    },
  ],
  types: {
    t_address: {
      encoding: "inplace",
      label: "address",
      numberOfBytes: "20",
    },
    t_bool: {
      encoding: "inplace",
      label: "bool",
      numberOfBytes: "1",
    },
    t_bytes32: {
      encoding: "inplace",
      label: "bytes32",
      numberOfBytes: "32",
    },
    "t_mapping(t_address,t_mapping(t_address,t_uint256))": {
      encoding: "mapping",
      key: "t_address",
      label: "mapping(address => mapping(address => uint256))",
      numberOfBytes: "32",
      value: "t_mapping(t_address,t_uint256)",
    },
    "t_mapping(t_address,t_uint256)": {
      encoding: "mapping",
      key: "t_address",
      label: "mapping(address => uint256)",
      numberOfBytes: "32",
      value: "t_uint256",
    },
    "t_mapping(t_bytes32,t_struct(RoleData)20_storage)": {
      encoding: "mapping",
      key: "t_bytes32",
      label: "mapping(bytes32 => struct RoleData)",
      numberOfBytes: "32",
      value: "t_struct(RoleData)20_storage",
    },
    "t_mapping(t_address,t_bool)": {
      encoding: "mapping",
      key: "t_address",
      label: "mapping(address => bool)",
      numberOfBytes: "32",
      value: "t_bool",
    },
    "t_array(t_uint256)dyn_storage": {
      base: "t_uint256",
      encoding: "dynamic_array",
      label: "uint256[]",
      numberOfBytes: "32",
    },
    "t_array(t_bool)4_storage": {
      base: "t_bool",
      encoding: "inplace",
      label: "bool[4]",
      numberOfBytes: "32",
    },
    "t_string_storage": {
      encoding: "bytes",
      label: "string",
      numberOfBytes: "32",
    },
    "t_struct(RoleData)20_storage": {
      encoding: "inplace",
      label: "struct RoleData",
      numberOfBytes: "64",
      members: [
        {
          astId: 8,
          contract: "Token.sol:Token",
          label: "hasRole",
          offset: 0,
          slot: "0",
          type: "t_mapping(t_address,t_bool)",
        },
        {
          astId: 9,
          contract: "Token.sol:Token",
          label: "adminRole",
          offset: 0,
          slot: "1",
          type: "t_bytes32",
        },
      ],
    },
    t_uint256: {
      encoding: "inplace",
      label: "uint256",
      numberOfBytes: "32",
    },
  },
};

const mappingSlot = (keyType: string, keyValue: string, slot: bigint) =>
  keccak256(coder.encode([keyType, "uint256"], [keyValue, slot]));

describe("storage-layout-utils", () => {
  test("parses a Solidity storage layout", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));

    expect(layout.storage).toHaveLength(8);
    expect(layout.storage[0].label).toBe("_balances");
    expect(layout.types.t_uint256.label).toBe("uint256");
  });

  test("resolves a mapping slot", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));
    const account = "0x000000000000000000000000000000000000dEaD";

    const resolved = resolveStoragePath(layout, "_balances", [
      { kind: "mappingKey", value: account },
    ]);

    expect(resolved.slot).toBe(mappingSlot("address", account, 0n));
    expect(resolved.typeId).toBe("t_uint256");
    expect(resolved.path).toBe(`_balances[${account}]`);
  });

  test("resolves a nested mapping slot", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));
    const owner = "0x000000000000000000000000000000000000dEaD";
    const spender = "0x000000000000000000000000000000000000bEEF";
    const ownerSlot = BigInt(mappingSlot("address", owner, 1n));

    const resolved = resolveStoragePath(layout, "_allowances", [
      { kind: "mappingKey", value: owner },
      { kind: "mappingKey", value: spender },
    ]);

    expect(resolved.slot).toBe(mappingSlot("address", spender, ownerSlot));
    expect(resolved.typeId).toBe("t_uint256");
    expect(resolved.path).toBe(`_allowances[${owner}][${spender}]`);
  });

  test("resolves struct fields and nested mappings inside structs", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));
    const role = `0x${"11".repeat(32)}`;
    const member = "0x000000000000000000000000000000000000dEaD";
    const roleBase = BigInt(mappingSlot("bytes32", role, 3n));

    const adminRole = resolveStoragePath(layout, "_roles", [
      { kind: "mappingKey", value: role },
      { kind: "structField", value: "adminRole" },
    ]);

    const hasRole = resolveStoragePath(layout, "_roles", [
      { kind: "mappingKey", value: role },
      { kind: "structField", value: "hasRole" },
      { kind: "mappingKey", value: member },
    ]);

    expect(adminRole.slot).toBe(toBeHex(roleBase + 1n, 32));
    expect(adminRole.typeId).toBe("t_bytes32");
    expect(hasRole.slot).toBe(mappingSlot("address", member, roleBase));
    expect(hasRole.typeId).toBe("t_bool");
  });

  test("resolves a dynamic array element slot", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));
    const dataStart = BigInt(keccak256(zeroPadValue(toBeHex(5n), 32)));

    const resolved = resolveStoragePath(layout, "_numbers", [
      { kind: "arrayIndex", value: "2" },
    ]);

    expect(resolved.slot).toBe(toBeHex(dataStart + 2n, 32));
    expect(resolved.typeId).toBe("t_uint256");
    expect(resolved.path).toBe("_numbers[2]");
  });

  test("resolves a packed static array element slot", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));

    const resolved = resolveStoragePath(layout, "_fixedFlags", [
      { kind: "arrayIndex", value: "3" },
    ]);

    expect(resolved.slot).toBe(toBeHex(6n, 32));
    expect(resolved.offset).toBe(3);
    expect(resolved.typeId).toBe("t_bool");
    expect(resolved.path).toBe("_fixedFlags[3]");
  });

  test("decodes primitive and packed values", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));
    const packedWord = `0x${"00".repeat(30)}0100`;

    expect(
      decodeStorageValue(layout, {
        typeId: "t_uint256",
        slot: toBeHex(0n, 32),
        offset: 0,
        path: "value",
      }, toBeHex(42n, 32)),
    ).toBe("42");
    expect(
      decodeStorageValue(layout, {
        typeId: "t_bool",
        slot: toBeHex(4n, 32),
        offset: 1,
        path: "_secondFlag",
      }, packedWord),
    ).toBe("true");
  });

  test("decodes a short storage string", () => {
    const layout = parseStorageLayout(JSON.stringify(sampleLayout));
    const ping = `0x${Buffer.from("Ping").toString("hex")}${"00".repeat(27)}08`;

    expect(
      decodeStorageValue(layout, {
        typeId: "t_string_storage",
        slot: toBeHex(2n, 32),
        offset: 0,
        path: "_name",
      }, ping),
    ).toBe("Ping");
  });
});
