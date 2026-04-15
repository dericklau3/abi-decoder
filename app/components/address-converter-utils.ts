import { getAddress } from "ethers";

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

export const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

export const normalizeHexInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

export const isValidHex = (value: string) => /^[0-9a-fA-F]*$/.test(value);

export const isValidDecimal = (value: string) => /^\d+$/.test(value);

const ensureBytes32Hex = (value: string) => {
  const normalized = normalizeHexInput(value);
  if (!normalized) {
    return "";
  }

  const hexBody = normalized.slice(2);
  if (!isValidHex(hexBody)) {
    throw new Error("请输入有效的十六进制");
  }

  if (hexBody.length !== 64) {
    throw new Error("Hex 长度必须等于 bytes32（64 个 hex 字符）");
  }

  return normalized.toLowerCase();
};

const bytesToBinaryString = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

const binaryStringToBytes = (value: string) =>
  Uint8Array.from(value, (char) => char.charCodeAt(0));

export const encodeUtf8ToBase64 = (value: string) => {
  if (!value) {
    return "";
  }

  return btoa(bytesToBinaryString(new TextEncoder().encode(value)));
};

export const decodeBase64ToUtf8 = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.length % 4 !== 0 || !BASE64_PATTERN.test(trimmed)) {
    throw new Error("请输入有效的 Base64");
  }

  try {
    const decoded = atob(trimmed);
    return new TextDecoder("utf-8", { fatal: true }).decode(
      binaryStringToBytes(decoded),
    );
  } catch {
    throw new Error("请输入有效的 Base64");
  }
};

export const decimalToBytes32Hex = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (!isValidDecimal(trimmed)) {
    throw new Error("请输入有效的十进制非负整数");
  }

  const decimal = BigInt(trimmed);
  if (decimal > MAX_UINT256) {
    throw new Error("数值超出 bytes32 可表示范围");
  }

  return `0x${decimal.toString(16).padStart(64, "0")}`;
};

export const bytes32HexToDecimal = (value: string) => {
  const normalized = ensureBytes32Hex(value);
  if (!normalized) {
    return "";
  }

  return BigInt(normalized).toString(10);
};

export const textToBytes32Hex = (value: string) => {
  if (!value) {
    return "";
  }

  const encoded = new TextEncoder().encode(value);
  if (encoded.length > 32) {
    throw new Error("UTF-8 字节长度不能超过 32");
  }

  const hex = Array.from(encoded, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `0x${hex.padEnd(64, "0")}`;
};

export const bytes32HexToText = (value: string) => {
  const normalized = ensureBytes32Hex(value);
  if (!normalized) {
    return "";
  }

  const hexBody = normalized.slice(2).replace(/(00)+$/, "");
  if (!hexBody) {
    return "";
  }

  const bytes = Uint8Array.from(
    hexBody.match(/.{1,2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  );

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("无法解析为 UTF-8 字符串");
  }
};

export const bytes32AddressToHex = (value: string) => {
  const normalized = normalizeAddressInput(value);
  if (!normalized) {
    return "";
  }

  const addressBody = normalized.slice(2);
  if (!/^[0-9a-fA-F]{40}$/.test(addressBody)) {
    throw new Error("请输入有效的地址");
  }

  return `0x${addressBody.toLowerCase().padStart(64, "0")}`;
};

export const bytes32HexToAddress = (value: string) => {
  const normalized = ensureBytes32Hex(value);
  if (!normalized) {
    return "";
  }

  const hexBody = normalized.slice(2);
  const prefix = hexBody.slice(0, 24);
  const addressBody = hexBody.slice(24);
  if (!/^0+$/.test(prefix) || !/^[0-9a-f]{40}$/.test(addressBody)) {
    throw new Error("该 bytes32 不是有效的地址编码");
  }

  return getAddress(`0x${addressBody}`);
};
