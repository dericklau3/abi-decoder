import { getAddress } from "ethers";

export type ProxyMode = "erc1967" | "beacon";

export type ProxyLookupResultRow = {
  label: string;
  value: string;
  copyable?: boolean;
};

export type ProxyLookupResult = {
  mode: ProxyMode;
  proxyAddress: string;
  implementationAddress: string;
  rows: ProxyLookupResultRow[];
};

export const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export const BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

export const BEACON_ABI = ["function implementation() view returns (address)"];

const BYTES32_HEX_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const normalized =
    trimmed.startsWith("0x") || trimmed.startsWith("0X")
      ? trimmed
      : `0x${trimmed}`;

  try {
    return getAddress(normalized);
  } catch {
    throw new Error("请输入有效的地址");
  }
};

export const ensureBytes32StorageSlot = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed.startsWith("0x") && !trimmed.startsWith("0X")) {
    throw new Error("Storage slot 必须是 bytes32");
  }

  if (trimmed.length !== 66) {
    throw new Error("Storage slot 必须是 bytes32");
  }

  if (!BYTES32_HEX_PATTERN.test(trimmed)) {
    throw new Error("Storage slot 必须是有效的 hex");
  }

  return `0x${trimmed.slice(2).toLowerCase()}`;
};

export const isEmptySlot = (value: string) => {
  const normalized = ensureBytes32StorageSlot(value);
  return /^0x0{64}$/.test(normalized);
};

export const addressFromStorageSlot = (value: string) => {
  const normalized = ensureBytes32StorageSlot(value);
  const addressBody = normalized.slice(-40);
  return getAddress(`0x${addressBody}`);
};
