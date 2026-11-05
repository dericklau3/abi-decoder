import { FunctionFragment, Interface, parseEther, Wallet } from "ethers";

import {
  appendTransactionOverrides,
  type AbiInputParam,
  parseArgumentValue,
  serializeParamType,
} from "./contract-interaction-utils";

export type BatchCallFunctionInfo = {
  signature: string;
  name: string;
  stateMutability: string;
  inputs: AbiInputParam[];
};

export type PrivateKeyAddressPreview = {
  index: number;
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
  if (privateKeys.length > 100) {
    throw new Error("单次最多支持 100 个测试钱包私钥");
  }
  if (privateKeys.some((key) => !/^0x[0-9a-fA-F]{64}$/.test(key))) {
    throw new Error("私钥格式无效：每行必须是 32 字节十六进制私钥");
  }
  if (new Set(privateKeys.map((key) => key.toLowerCase())).size !== privateKeys.length) {
    throw new Error("检测到重复私钥，已阻止重复发送交易");
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
          address: new Wallet(privateKey).address,
        };
      } catch {
        return {
          index,
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
      inputs: fn.inputs.map(serializeParamType),
    }));
};

export const prepareBatchCallArgs = (
  fn: BatchCallFunctionInfo,
  rawInputs: string[],
  payableValue: string,
) =>
  appendTransactionOverrides(
    fn.inputs.map((input, index) =>
      parseArgumentValue(input, rawInputs[index] ?? ""),
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
