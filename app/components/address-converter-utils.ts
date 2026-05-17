import { getAddress, sha256 } from "ethers";

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TRON_ADDRESS_PREFIX = 0x41;

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

const hexToBytes = (value: string) =>
  Uint8Array.from(value.match(/.{1,2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const concatBytes = (...chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

const doubleSha256 = (bytes: Uint8Array) =>
  hexToBytes(sha256(hexToBytes(sha256(bytes).slice(2))).slice(2));

const base58Encode = (bytes: Uint8Array) => {
  let value = BigInt(`0x${bytesToHex(bytes) || "0"}`);
  let output = "";

  while (value > BigInt(0)) {
    const remainder = Number(value % BigInt(58));
    output = BASE58_ALPHABET[remainder] + output;
    value /= BigInt(58);
  }

  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }
    output = "1" + output;
  }

  return output || "1";
};

const base58Decode = (value: string) => {
  let decoded = BigInt(0);
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit === -1) {
      throw new Error("请输入有效的 Tron 地址");
    }
    decoded = decoded * BigInt(58) + BigInt(digit);
  }

  const hex = decoded.toString(16).padStart(decoded.toString(16).length + (decoded.toString(16).length % 2), "0");
  const bytes = hex === "00" && decoded === BigInt(0) ? new Uint8Array() : hexToBytes(hex);
  const leadingZeroes = value.match(/^1*/)?.[0].length ?? 0;

  return concatBytes(new Uint8Array(leadingZeroes), bytes);
};

const ensureTronBase58CheckPayload = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return new Uint8Array();
  }

  const decoded = base58Decode(trimmed);
  if (decoded.length !== 25) {
    throw new Error("请输入有效的 Tron 地址");
  }

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);
  if (!checksum.every((byte, index) => byte === expectedChecksum[index])) {
    throw new Error("请输入有效的 Tron 地址");
  }

  if (payload[0] !== TRON_ADDRESS_PREFIX) {
    throw new Error("请输入 Tron 主网地址");
  }

  return payload;
};

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

export const tronAddressToEvmAddress = (value: string) => {
  const payload = ensureTronBase58CheckPayload(value);
  if (!payload.length) {
    return "";
  }

  return getAddress(`0x${bytesToHex(payload.slice(1))}`);
};

export const evmAddressToTronAddress = (value: string) => {
  const normalized = normalizeAddressInput(value);
  if (!normalized) {
    return "";
  }

  const checksummed = getAddress(normalized);
  const payload = concatBytes(
    Uint8Array.of(TRON_ADDRESS_PREFIX),
    hexToBytes(checksummed.slice(2)),
  );
  const checksum = doubleSha256(payload).slice(0, 4);

  return base58Encode(concatBytes(payload, checksum));
};
