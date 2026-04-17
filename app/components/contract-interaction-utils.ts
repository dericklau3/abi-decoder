import { getAddress, Interface, ParamType } from "ethers";

const normalizeAddressInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
};

const parseJsonInput = (value: string, label: string) => {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} 请输入合法的 JSON`);
  }
};

const isIntegerType = (baseType: string) =>
  baseType === "int" ||
  baseType === "uint" ||
  baseType.startsWith("int") ||
  baseType.startsWith("uint");

const coerceByParamType = (param: ParamType, rawValue: unknown): unknown => {
  if (param.baseType === "array") {
    const childParam = param.arrayChildren;
    if (!childParam) {
      throw new Error(`${param.type} 参数缺少数组子类型定义`);
    }
    const parsedArray =
      typeof rawValue === "string"
        ? parseJsonInput(rawValue.trim(), `${param.type} 参数`)
        : rawValue;
    if (!Array.isArray(parsedArray)) {
      throw new Error(`${param.type} 参数必须是数组`);
    }
    return parsedArray.map((item) => coerceByParamType(childParam, item));
  }

  if (param.baseType === "tuple") {
    const tupleComponents = param.components;
    if (!tupleComponents) {
      throw new Error(`${param.type} 参数缺少元组组件定义`);
    }
    const parsedTuple =
      typeof rawValue === "string"
        ? parseJsonInput(rawValue.trim(), `${param.type} 参数`)
        : rawValue;

    if (Array.isArray(parsedTuple)) {
      return tupleComponents.map((component, index) =>
        coerceByParamType(component, parsedTuple[index]),
      );
    }

    if (parsedTuple && typeof parsedTuple === "object") {
      return tupleComponents.map((component, index) => {
        const key = component.name || String(index);
        return coerceByParamType(
          component,
          (parsedTuple as Record<string, unknown>)[key],
        );
      });
    }

    throw new Error(`${param.type} 参数必须是 JSON 对象或数组`);
  }

  if (typeof rawValue !== "string") {
    if (param.baseType === "bool" && typeof rawValue === "boolean") {
      return rawValue;
    }
    if (isIntegerType(param.baseType) && typeof rawValue === "number") {
      if (!Number.isInteger(rawValue)) {
        throw new Error(`${param.type} 参数必须是整数`);
      }
      return BigInt(rawValue);
    }
    return rawValue;
  }

  const trimmed = rawValue.trim();

  if (param.baseType === "string") {
    return rawValue;
  }

  if (!trimmed) {
    return "";
  }

  if (param.baseType === "address") {
    return getAddress(normalizeAddressInput(trimmed));
  }

  if (param.baseType === "bool") {
    if (trimmed === "true") {
      return true;
    }
    if (trimmed === "false") {
      return false;
    }
    throw new Error(`${param.type} 参数必须是 true 或 false`);
  }

  if (isIntegerType(param.baseType)) {
    try {
      return BigInt(trimmed);
    } catch {
      throw new Error(`${param.type} 参数必须是整数`);
    }
  }

  if (param.baseType === "array" || param.baseType === "tuple") {
    return coerceByParamType(param, rawValue);
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonInput(trimmed, `${param.type} 参数`);
  }

  return trimmed;
};

export const parseArgumentValue = (type: string, value: string) =>
  coerceByParamType(ParamType.from(type), value);

export const encodeFunctionCalldata = (
  abi: any[],
  signature: string,
  inputs: Array<{ type: string }>,
  rawInputs: string[],
) => {
  const iface = new Interface(abi);
  const args = inputs.map((input, index) =>
    parseArgumentValue(input.type, rawInputs[index] ?? ""),
  );
  return iface.encodeFunctionData(signature, args);
};

export const appendTransactionOverrides = (
  args: unknown[],
  stateMutability: string,
  payableValue: string,
) => {
  if (stateMutability !== "payable") {
    return args;
  }

  const trimmedPayableValue = payableValue.trim();
  if (!trimmedPayableValue) {
    return args;
  }

  return [...args, { value: trimmedPayableValue }];
};

export const extractContractErrorMessage = (error: unknown): string => {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }

    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      const directMessage = [record.shortMessage, record.reason, record.message].find(
        (value) => typeof value === "string" && value.trim(),
      );
      if (typeof directMessage === "string") {
        return directMessage.trim();
      }
      queue.push(record.error, record.info, record.data, record.cause);
    }
  }

  return "未知错误，请检查钱包弹窗、网络和合约参数";
};

export { normalizeAddressInput };
