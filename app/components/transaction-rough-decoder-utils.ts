import { getAddress } from "ethers";

export type RoughDecodedWord = {
  index: number;
  byteOffset: number;
  raw: string;
  uint256: string;
  address?: string;
  dynamicOffset?: {
    byteOffset: number;
    targetWordIndex: number;
  };
};

export type RoughDynamicSegment = {
  fromWordIndex: number;
  byteOffset: number;
  targetWordIndex: number;
  kind: "address[]" | "uint256[]" | "bytes" | "struct{}";
  length?: number;
  values?: Array<string>;
  words?: Array<RoughDecodedWord>;
};

export type RoughDecodedCallData = {
  selector: string;
  payload: string;
  words: Array<RoughDecodedWord>;
  dynamicSegments: Array<RoughDynamicSegment>;
  staticStructCandidate: {
    kind: "struct{}";
    fields: Array<RoughDecodedWord>;
  };
};

const WORD_HEX_LENGTH = 64;

const normalizeHexData = (value: string) => {
  const stripped = value.trim().replace(/\s+/g, "").replace(/^0x/i, "");
  if (!stripped || stripped.length < 8 || stripped.length % 2 !== 0 || /[^0-9a-f]/i.test(stripped)) {
    throw new Error("请输入有效的 hex data");
  }
  return stripped.toLowerCase();
};

const toWordHex = (word: string) => `0x${word}`;

const wordToBigInt = (word: string) => BigInt(toWordHex(word));

const getAddressCandidate = (word: string) => {
  if (!word.startsWith("0".repeat(24))) {
    return undefined;
  }
  return getAddress(`0x${word.slice(24)}`);
};

const splitWords = (payload: string) => {
  const words: Array<string> = [];
  for (let index = 0; index + WORD_HEX_LENGTH <= payload.length; index += WORD_HEX_LENGTH) {
    words.push(payload.slice(index, index + WORD_HEX_LENGTH));
  }
  return words;
};

const decodeWords = (rawWords: Array<string>): Array<RoughDecodedWord> =>
  rawWords.map((raw, index) => ({
    index,
    byteOffset: index * 32,
    raw: toWordHex(raw),
    uint256: wordToBigInt(raw).toString(),
    address: getAddressCandidate(raw),
  }));

const isOffsetCandidate = (value: bigint, payloadByteLength: number) => {
  return value > BigInt(0) && value % BigInt(32) === BigInt(0) && value < BigInt(payloadByteLength);
};

const getArrayLength = (words: Array<RoughDecodedWord>, targetWordIndex: number) => {
  const lengthWord = words[targetWordIndex];
  if (!lengthWord) {
    return undefined;
  }
  const length = BigInt(lengthWord.uint256);
  const remaining = words.length - targetWordIndex - 1;
  if (length < BigInt(0) || length > BigInt(remaining) || length > BigInt(1000)) {
    return undefined;
  }
  return Number(length);
};

const tryDecodeUtf8 = (hex: string) => {
  try {
    const bytes = hex.match(/.{1,2}/g)?.map((item) => Number.parseInt(item, 16)) || [];
    const text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
};

const getBytesSegment = (
  sourceWord: RoughDecodedWord,
  words: Array<RoughDecodedWord>,
): RoughDynamicSegment | undefined => {
  const offset = sourceWord.dynamicOffset;
  if (!offset) {
    return undefined;
  }
  const lengthWord = words[offset.targetWordIndex];
  if (!lengthWord) {
    return undefined;
  }
  const byteLength = BigInt(lengthWord.uint256);
  const availableBytes = BigInt((words.length - offset.targetWordIndex - 1) * 32);
  if (byteLength < BigInt(0) || byteLength > availableBytes || byteLength > BigInt(100000)) {
    return undefined;
  }

  const dataHex = words
    .slice(offset.targetWordIndex + 1)
    .map((word) => word.raw.slice(2))
    .join("")
    .slice(0, Number(byteLength) * 2);
  if (dataHex.length !== Number(byteLength) * 2) {
    return undefined;
  }

  const values = [`0x${dataHex}`];
  const utf8 = tryDecodeUtf8(dataHex);
  if (utf8) {
    values.push(utf8);
  }

  return {
    fromWordIndex: sourceWord.index,
    byteOffset: offset.byteOffset,
    targetWordIndex: offset.targetWordIndex,
    kind: "bytes",
    length: Number(byteLength),
    values,
  };
};

const detectDynamicSegment = (
  sourceWord: RoughDecodedWord,
  words: Array<RoughDecodedWord>,
): RoughDynamicSegment | undefined => {
  const offset = sourceWord.dynamicOffset;
  if (!offset) {
    return undefined;
  }

  const bytesSegment = getBytesSegment(sourceWord, words);
  const length = getArrayLength(words, offset.targetWordIndex);
  if (bytesSegment && (length === undefined || bytesSegment.length !== length)) {
    return bytesSegment;
  }
  if (length === undefined) {
    return {
      fromWordIndex: sourceWord.index,
      byteOffset: offset.byteOffset,
      targetWordIndex: offset.targetWordIndex,
      kind: "struct{}",
      words: words.slice(offset.targetWordIndex),
    };
  }

  const values = words.slice(offset.targetWordIndex + 1, offset.targetWordIndex + 1 + length);
  const addressValues = values.map((item) => item.address);
  if (addressValues.every(Boolean)) {
    return {
      fromWordIndex: sourceWord.index,
      byteOffset: offset.byteOffset,
      targetWordIndex: offset.targetWordIndex,
      kind: "address[]",
      length,
      values: addressValues as Array<string>,
    };
  }

  return {
    fromWordIndex: sourceWord.index,
    byteOffset: offset.byteOffset,
    targetWordIndex: offset.targetWordIndex,
    kind: "uint256[]",
    length,
    values: values.map((item) => item.uint256),
  };
};

export const roughDecodeCalldata = (value: string): RoughDecodedCallData => {
  const hex = normalizeHexData(value);
  const selector = `0x${hex.slice(0, 8)}`;
  const payload = hex.slice(8);
  const rawWords = splitWords(payload);
  const words = decodeWords(rawWords);
  const payloadByteLength = payload.length / 2;

  for (const decodedWord of words) {
    const uintValue = BigInt(decodedWord.uint256);
    if (isOffsetCandidate(uintValue, payloadByteLength)) {
      decodedWord.dynamicOffset = {
        byteOffset: Number(uintValue),
        targetWordIndex: Number(uintValue / BigInt(32)),
      };
    }
  }

  const dynamicSegments = words
    .map((item) => detectDynamicSegment(item, words))
    .filter((item): item is RoughDynamicSegment => Boolean(item));
  const consumedWordIndexes = new Set<number>();
  for (const segment of dynamicSegments) {
    consumedWordIndexes.add(segment.fromWordIndex);
    const segmentWordCount = segment.length === undefined ? words.length - segment.targetWordIndex : segment.length + 1;
    for (let index = 0; index < segmentWordCount; index += 1) {
      consumedWordIndexes.add(segment.targetWordIndex + index);
    }
  }

  return {
    selector,
    payload: `0x${payload}`,
    words,
    dynamicSegments,
    staticStructCandidate: {
      kind: "struct{}",
      fields: words.filter((item) => !consumedWordIndexes.has(item.index)),
    },
  };
};
