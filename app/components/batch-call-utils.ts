import { FunctionFragment, Interface, parseEther, Wallet } from "ethers";

import {
  appendTransactionOverrides,
  parseArgumentValue,
} from "./contract-interaction-utils";

export type BatchCallFunctionInfo = {
  signature: string;
  name: string;
  stateMutability: string;
  inputs: Array<{ name: string; type: string }>;
};

export type PrivateKeyAddressPreview = {
  index: number;
  privateKey: string;
  address?: string;
  error?: string;
};

const normalizePrivateKey = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

export const parsePrivateKeyLines = (value: string) => {
  const privateKeys = value
    .split(/\r?\n/)
    .map(normalizePrivateKey)
    .filter(Boolean);

  if (privateKeys.length === 0) {
    throw new Error("请至少填写一个私钥");
  }

  return privateKeys;
};

export const getPrivateKeyAddressPreviews = (
  value: string,
): PrivateKeyAddressPreview[] =>
  value
    .split(/\r?\n/)
    .map(normalizePrivateKey)
    .map((privateKey, index) => ({ privateKey, index }))
    .filter((item) => Boolean(item.privateKey))
    .map(({ privateKey, index }) => {
      try {
        return {
          index,
          privateKey,
          address: new Wallet(privateKey).address,
        };
      } catch {
        return {
          index,
          privateKey,
          error: "私钥格式无效",
        };
      }
    });

export const getWritableFunctionInfos = (
  abi: any[],
): BatchCallFunctionInfo[] => {
  const iface = new Interface(abi);
  return iface.fragments
    .filter((fragment) => fragment.type === "function")
    .map((fragment) => fragment as FunctionFragment)
    .filter(
      (fn) =>
        fn.stateMutability !== "view" && fn.stateMutability !== "pure",
    )
    .map((fn) => ({
      signature: fn.format(),
      name: fn.name,
      stateMutability: fn.stateMutability ?? "nonpayable",
      inputs: fn.inputs.map((input) => ({
        name: input.name,
        type: input.type,
      })),
    }));
};

export const prepareBatchCallArgs = (
  fn: BatchCallFunctionInfo,
  rawInputs: string[],
  payableValue: string,
) =>
  appendTransactionOverrides(
    fn.inputs.map((input, index) =>
      parseArgumentValue(input.type, rawInputs[index] ?? ""),
    ),
    fn.stateMutability,
    payableValue,
  ).map((item) =>
    typeof item === "object" &&
    item !== null &&
    "value" in item &&
    typeof (item as { value: unknown }).value === "string"
      ? { value: parseEther((item as { value: string }).value) }
      : item,
  );
