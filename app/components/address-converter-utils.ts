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
