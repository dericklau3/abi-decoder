import { AbiCoder, Interface } from "ethers";

import {
  parseArgumentInputs,
  type IntegerUnit,
} from "./contract-interaction-utils";

export type ManualEncodeParam = {
  type: string;
  value: string;
  unit?: IntegerUnit;
};

export type ManualEncodeInput = {
  functionSignature?: string;
  selector?: string;
  params: ManualEncodeParam[];
};

export type ManualEncodeResult = {
  selector: string;
  payload: string;
  data: string;
};

export type ManualSignatureParam = {
  type: string;
};

export type ManualSignatureInfo = {
  selector: string;
  params: ManualSignatureParam[];
};

const normalizeSelector = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{8}$/.test(normalized)) {
    throw new Error("selector 必须是 4-byte hex");
  }
  return normalized.toLowerCase();
};

const normalizeFunctionSignature = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^function\s+/, "");
};

export const parseManualFunctionSignature = (
  value: string,
): ManualSignatureInfo => {
  const signature = normalizeFunctionSignature(value);
  if (!signature) {
    return { selector: "", params: [] };
  }

  try {
    const iface = new Interface([`function ${signature}`]);
    const fragment = iface.getFunction(signature);
    if (!fragment) {
      throw new Error("无法识别函数签名");
    }
    return {
      selector: fragment.selector,
      params: fragment.inputs.map((input) => ({
        type: input.format("sighash"),
      })),
    };
  } catch (error) {
    throw new Error(`函数签名无效：${(error as Error).message}`);
  }
};

const getSelectorFromSignature = (value: string) => {
  if (!normalizeFunctionSignature(value)) {
    return "";
  }

  return parseManualFunctionSignature(value).selector;
};

export const encodeManualTransactionData = ({
  functionSignature = "",
  selector = "",
  params,
}: ManualEncodeInput): ManualEncodeResult => {
  const selectorFromSignature = getSelectorFromSignature(functionSignature);
  const normalizedSelector = selectorFromSignature || normalizeSelector(selector);
  const types = params.map((param) => param.type.trim());
  const values = params.map((param) => param.value);
  const units = params.map((param) => param.unit ?? "wei");
  const parsedValues = parseArgumentInputs(types, values, units);
  const payload = AbiCoder.defaultAbiCoder().encode(types, parsedValues);

  return {
    selector: normalizedSelector,
    payload,
    data: normalizedSelector ? `${normalizedSelector}${payload.slice(2)}` : payload,
  };
};
