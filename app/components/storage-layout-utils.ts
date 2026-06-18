import {
  AbiCoder,
  getAddress,
  hexlify,
  isAddress,
  isHexString,
  keccak256,
  toBeHex,
  toUtf8String,
  zeroPadValue,
} from "ethers";

export type StorageEntry = {
  astId?: number;
  contract: string;
  label: string;
  offset: number;
  slot: string;
  type: string;
};

export type StorageType = {
  base?: string;
  encoding: string;
  key?: string;
  label: string;
  members?: StorageEntry[];
  numberOfBytes: string;
  value?: string;
};

export type StorageLayout = {
  storage: StorageEntry[];
  types: Record<string, StorageType>;
};

export type StoragePathSegment =
  | { kind: "arrayIndex"; value: string }
  | { kind: "mappingKey"; value: string }
  | { kind: "structField"; value: string };

export type ResolvedStoragePath = {
  offset: number;
  path: string;
  slot: string;
  typeId: string;
};

export type SelectionStep =
  | {
      kind: "arrayIndex";
      label: string;
      path: string;
      typeId: string;
    }
  | {
      kind: "mappingKey";
      keyTypeId: string;
      keyTypeLabel: string;
      label: string;
      path: string;
      typeId: string;
    }
  | {
      fields: StorageEntry[];
      kind: "structField";
      label: string;
      path: string;
      typeId: string;
    };

const coder = AbiCoder.defaultAbiCoder();
export const MAX_LONG_STORAGE_BYTES_SLOTS = 128;

const normalizeSlot = (slot: bigint | string) => toBeHex(BigInt(slot), 32);

const parseSlot = (slot: string) => BigInt(slot);

const requireType = (layout: StorageLayout, typeId: string) => {
  const type = layout.types[typeId];
  if (!type) {
    throw new Error(`未知 storage 类型：${typeId}`);
  }
  return type;
};

const findEntry = (layout: StorageLayout, label: string) => {
  const entry = layout.storage.find((item) => item.label === label);
  if (!entry) {
    throw new Error(`找不到变量：${label}`);
  }
  return entry;
};

const solidityTypeFromTypeId = (layout: StorageLayout, typeId: string) => {
  const type = requireType(layout, typeId);
  if (type.label.startsWith("contract ")) {
    return "address";
  }
  return type.label.replace(/^enum\s+/, "uint8");
};

const normalizeKeyValue = (
  layout: StorageLayout,
  typeId: string,
  value: string,
) => {
  const solidityType = solidityTypeFromTypeId(layout, typeId);
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("mapping key 不能为空");
  }

  if (solidityType === "address") {
    const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    if (!isAddress(withPrefix)) {
      throw new Error("mapping address key 无效");
    }
    return getAddress(withPrefix);
  }

  if (solidityType === "bool") {
    if (trimmed !== "true" && trimmed !== "false") {
      throw new Error("bool key 只能是 true 或 false");
    }
    return trimmed === "true";
  }

  if (/^u?int\d*$/.test(solidityType)) {
    return BigInt(trimmed);
  }

  if (/^bytes\d+$/.test(solidityType)) {
    if (!isHexString(trimmed)) {
      throw new Error(`${solidityType} key 必须是 hex`);
    }
    return zeroPadValue(trimmed, Number(solidityType.slice(5)));
  }

  if (solidityType === "bytes32") {
    if (!isHexString(trimmed, 32)) {
      throw new Error("bytes32 key 必须是 32 字节 hex");
    }
    return trimmed;
  }

  if (solidityType === "string") {
    return trimmed;
  }

  throw new Error(`暂不支持 ${solidityType} 类型作为 mapping key`);
};

const mappingSlot = (
  layout: StorageLayout,
  keyTypeId: string,
  keyValue: string,
  slot: bigint,
) => {
  const solidityType = solidityTypeFromTypeId(layout, keyTypeId);
  const normalized = normalizeKeyValue(layout, keyTypeId, keyValue);
  return BigInt(
    keccak256(coder.encode([solidityType, "uint256"], [normalized, slot])),
  );
};

const dynamicArrayDataStart = (slot: bigint) =>
  BigInt(keccak256(zeroPadValue(toBeHex(slot), 32)));

const typeByteSize = (layout: StorageLayout, typeId: string) =>
  Number(requireType(layout, typeId).numberOfBytes);

const isStructType = (type: StorageType) =>
  type.encoding === "inplace" && Array.isArray(type.members);

const isStaticArrayType = (type: StorageType) =>
  type.encoding === "inplace" && Boolean(type.base) && /\[\d+\]$/.test(type.label);

const applySegment = (
  layout: StorageLayout,
  current: ResolvedStoragePath,
  segment: StoragePathSegment,
): ResolvedStoragePath => {
  const type = requireType(layout, current.typeId);
  const slot = parseSlot(current.slot);

  if (type.encoding === "mapping") {
    if (segment.kind !== "mappingKey") {
      throw new Error(`${current.path} 需要 mapping key`);
    }
    if (!type.key || !type.value) {
      throw new Error(`${current.path} mapping 类型缺少 key/value`);
    }
    return {
      offset: 0,
      path: `${current.path}[${segment.value}]`,
      slot: normalizeSlot(mappingSlot(layout, type.key, segment.value, slot)),
      typeId: type.value,
    };
  }

  if (type.encoding === "dynamic_array") {
    if (segment.kind !== "arrayIndex") {
      throw new Error(`${current.path} 需要 array index`);
    }
    if (!type.base) {
      throw new Error(`${current.path} array 类型缺少 base`);
    }
    const index = BigInt(segment.value);
    const elementBytes = typeByteSize(layout, type.base);
    const dataStart = dynamicArrayDataStart(slot);
    const slotsPerElement =
      elementBytes > 32 ? BigInt(Math.ceil(elementBytes / 32)) : BigInt(1);
    const itemSlot =
      elementBytes >= 32
        ? dataStart + index * slotsPerElement
        : dataStart + (index * BigInt(elementBytes)) / BigInt(32);
    const itemOffset =
      elementBytes >= 32
        ? 0
        : Number((index * BigInt(elementBytes)) % BigInt(32));
    return {
      offset: itemOffset,
      path: `${current.path}[${segment.value}]`,
      slot: normalizeSlot(itemSlot),
      typeId: type.base,
    };
  }

  if (isStaticArrayType(type)) {
    if (segment.kind !== "arrayIndex") {
      throw new Error(`${current.path} 需要 array index`);
    }
    if (!type.base) {
      throw new Error(`${current.path} array 类型缺少 base`);
    }
    const index = BigInt(segment.value);
    const elementBytes = typeByteSize(layout, type.base);
    const itemSlot =
      elementBytes >= 32
        ? slot + index * BigInt(Math.ceil(elementBytes / 32))
        : slot + (index * BigInt(elementBytes)) / BigInt(32);
    const itemOffset =
      elementBytes >= 32
        ? 0
        : Number((index * BigInt(elementBytes)) % BigInt(32));
    return {
      offset: itemOffset,
      path: `${current.path}[${segment.value}]`,
      slot: normalizeSlot(itemSlot),
      typeId: type.base,
    };
  }

  if (isStructType(type)) {
    if (segment.kind !== "structField") {
      throw new Error(`${current.path} 需要 struct 字段`);
    }
    const member = type.members?.find((item) => item.label === segment.value);
    if (!member) {
      throw new Error(`${current.path} 找不到 struct 字段：${segment.value}`);
    }
    return {
      offset: member.offset,
      path: `${current.path}.${member.label}`,
      slot: normalizeSlot(slot + BigInt(member.slot)),
      typeId: member.type,
    };
  }

  throw new Error(`${current.path} 已经是可读取值，不需要更多路径参数`);
};

export const parseStorageLayout = (value: string): StorageLayout => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("storage-layout JSON 解析失败");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as StorageLayout).storage) ||
    !(parsed as StorageLayout).types ||
    typeof (parsed as StorageLayout).types !== "object"
  ) {
    throw new Error("storage-layout 需要包含 storage 数组和 types 对象");
  }

  return parsed as StorageLayout;
};

export const createInitialSelection = (
  layout: StorageLayout,
  variableLabel: string,
): ResolvedStoragePath => {
  const entry = findEntry(layout, variableLabel);
  return {
    offset: entry.offset,
    path: entry.label,
    slot: normalizeSlot(entry.slot),
    typeId: entry.type,
  };
};

export const resolveStoragePath = (
  layout: StorageLayout,
  variableLabel: string,
  segments: StoragePathSegment[],
): ResolvedStoragePath =>
  segments.reduce(
    (current, segment) => applySegment(layout, current, segment),
    createInitialSelection(layout, variableLabel),
  );

export const getSelectionSteps = (
  layout: StorageLayout,
  variableLabel: string,
  segments: StoragePathSegment[],
) => {
  const resolved = resolveStoragePath(layout, variableLabel, segments);
  const type = requireType(layout, resolved.typeId);
  let nextStep: SelectionStep | null = null;

  if (type.encoding === "mapping" && type.key) {
    const keyType = requireType(layout, type.key);
    nextStep = {
      kind: "mappingKey",
      keyTypeId: type.key,
      keyTypeLabel: keyType.label,
      label: `输入 ${keyType.label} key`,
      path: resolved.path,
      typeId: resolved.typeId,
    };
  } else if (type.encoding === "dynamic_array") {
    nextStep = {
      kind: "arrayIndex",
      label: "输入 array index",
      path: resolved.path,
      typeId: resolved.typeId,
    };
  } else if (isStaticArrayType(type)) {
    nextStep = {
      kind: "arrayIndex",
      label: "输入 array index",
      path: resolved.path,
      typeId: resolved.typeId,
    };
  } else if (isStructType(type)) {
    nextStep = {
      fields: type.members ?? [],
      kind: "structField",
      label: "选择 struct 字段",
      path: resolved.path,
      typeId: resolved.typeId,
    };
  }

  return { nextStep, resolved };
};

const normalizeWord = (word: string) => {
  if (!isHexString(word, 32)) {
    throw new Error("Storage slot 必须是 bytes32");
  }
  return word.toLowerCase();
};

const readBytesFromWord = (word: string, offset: number, numberOfBytes: number) => {
  const hex = normalizeWord(word).slice(2);
  const start = (32 - offset - numberOfBytes) * 2;
  return `0x${hex.slice(start, start + numberOfBytes * 2)}`;
};

const decodeInteger = (bytes: string, signed: boolean) => {
  const value = BigInt(bytes);
  if (!signed) {
    return value.toString();
  }
  const bitLength = BigInt((bytes.length - 2) * 4);
  const signBit = BigInt(1) << (bitLength - BigInt(1));
  return (
    value & signBit ? value - (BigInt(1) << bitLength) : value
  ).toString();
};

const decodeShortBytes = (word: string, asString: boolean) => {
  const normalized = normalizeWord(word);
  const lastByte = Number(`0x${normalized.slice(-2)}`);
  if (lastByte % 2 === 1) {
    return "";
  }
  const length = lastByte / 2;
  const data = `0x${normalized.slice(2, 2 + length * 2)}`;
  return asString ? toUtf8String(data) : data;
};

export const isLongStorageBytes = (word: string) => {
  const normalized = normalizeWord(word);
  return Number(`0x${normalized.slice(-2)}`) % 2 === 1;
};

export const getLongStorageBytesLength = (word: string) => {
  const normalized = normalizeWord(word);
  return (BigInt(normalized) - BigInt(1)) / BigInt(2);
};

export const getLongStorageBytesSlotCount = (
  length: bigint,
  maxSlots = MAX_LONG_STORAGE_BYTES_SLOTS,
) => {
  const slotsToRead = Math.ceil(Number(length) / 32);
  if (!Number.isSafeInteger(slotsToRead) || slotsToRead > maxSlots) {
    throw new Error(`bytes/string 长度过大，最多读取 ${maxSlots * 32} 字节`);
  }
  return slotsToRead;
};

export const decodeLongStorageBytes = (
  words: string[],
  length: bigint,
  asString: boolean,
) => {
  const joined = words.map((word) => normalizeWord(word).slice(2)).join("");
  const data = `0x${joined.slice(0, Number(length) * 2)}`;
  return asString ? toUtf8String(data) : hexlify(data);
};

export const decodeStorageValue = (
  layout: StorageLayout,
  resolved: ResolvedStoragePath,
  word: string,
) => {
  const type = requireType(layout, resolved.typeId);
  const label = type.label;
  const bytes = readBytesFromWord(
    word,
    resolved.offset,
    Number(type.numberOfBytes),
  );

  if (label === "address") {
    return getAddress(`0x${bytes.slice(-40)}`);
  }
  if (label === "bool") {
    return (BigInt(bytes) !== BigInt(0)).toString();
  }
  if (/^uint\d*$/.test(label)) {
    return decodeInteger(bytes, false);
  }
  if (/^int\d*$/.test(label)) {
    return decodeInteger(bytes, true);
  }
  if (label === "bytes32" || /^bytes\d+$/.test(label)) {
    return bytes;
  }
  if (type.encoding === "bytes") {
    return decodeShortBytes(word, label === "string");
  }
  return bytes;
};
