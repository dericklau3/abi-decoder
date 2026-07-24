import { getAddress, Interface, ParamType, parseUnits } from "ethers";

export type IntegerUnit = "wei" | "gwei" | "ether";

export type AbiInputParam = {
  name?: string;
  type: string;
  components?: AbiInputParam[];
};

export type ArgumentInputValues = Record<string, string>;
export type ArgumentUnitValues = Record<string, IntegerUnit>;

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

const toParamType = (input: string | AbiInputParam) =>
  ParamType.from(input as string);

const getTupleComponents = (
  param: ParamType,
): readonly ParamType[] | null | undefined => {
  if (param.components) {
    return param.components;
  }
  if (param.baseType === "array" && param.arrayChildren) {
    return getTupleComponents(param.arrayChildren);
  }
  return undefined;
};

export const serializeParamType = (param: ParamType): AbiInputParam => {
  const tupleComponents = getTupleComponents(param);

  return {
    name: param.name,
    type: param.type,
    ...(tupleComponents
      ? { components: tupleComponents.map(serializeParamType) }
      : {}),
  };
};

export const isIntegerParamType = (type: string | AbiInputParam) =>
  isIntegerType(toParamType(type).baseType);

export const isExpandableTupleParam = (
  input: string | AbiInputParam,
): input is AbiInputParam & { components: AbiInputParam[] } =>
  typeof input !== "string" &&
  input.type === "tuple" &&
  Boolean(input.components?.length);

export const setArgumentInputValue = (
  values: ArgumentInputValues,
  path: string,
  value: string,
): ArgumentInputValues => ({
  ...values,
  [path]: value,
});

export const setArgumentUnitValue = (
  values: ArgumentUnitValues,
  path: string,
  value: IntegerUnit,
): ArgumentUnitValues => ({
  ...values,
  [path]: value,
});

const getRawInputAtPath = (
  values: string[] | ArgumentInputValues,
  path: string,
) => (Array.isArray(values) ? values[Number(path)] ?? "" : values[path] ?? "");

const getUnitAtPath = (
  values: IntegerUnit[] | ArgumentUnitValues,
  path: string,
) => (Array.isArray(values) ? values[Number(path)] ?? "wei" : values[path] ?? "wei");

export const getArgumentInputValue = (
  input: string | AbiInputParam,
  values: string[] | ArgumentInputValues,
  path: string,
): unknown => {
  if (!isExpandableTupleParam(input)) {
    return getRawInputAtPath(values, path);
  }

  return input.components.reduce<Record<string, unknown>>(
    (tupleValue, component, index) => {
      const key = component.name || String(index);
      tupleValue[key] = getArgumentInputValue(component, values, `${path}.${index}`);
      return tupleValue;
    },
    {},
  );
};

const hasMissingArgumentInput = (
  input: string | AbiInputParam,
  values: string[] | ArgumentInputValues,
  path: string,
): boolean => {
  if (isExpandableTupleParam(input)) {
    if (getRawInputAtPath(values, path).trim()) {
      return false;
    }
    return input.components.some((component, index) =>
      hasMissingArgumentInput(component, values, `${path}.${index}`),
    );
  }
  return !getRawInputAtPath(values, path).trim();
};

export const hasMissingArgumentInputs = (
  inputs: Array<string | AbiInputParam>,
  values: string[] | ArgumentInputValues,
) =>
  inputs.some((input, index) =>
    hasMissingArgumentInput(input, values, String(index)),
  );

const integerUnitDecimals: Record<IntegerUnit, number> = {
  wei: 0,
  gwei: 9,
  ether: 18,
};

const parseIntegerWithUnit = (
  param: ParamType,
  value: string,
  unit: IntegerUnit,
) => {
  try {
    return parseUnits(value, integerUnitDecimals[unit]);
  } catch {
    if (unit === "wei") {
      throw new Error(`${param.type} 参数使用 wei 单位时必须是整数`);
    }
    throw new Error(`${param.type} 参数必须是有效的 ${unit} 数值`);
  }
};

const coerceByParamType = (
  param: ParamType,
  rawValue: unknown,
  unit: IntegerUnit = "wei",
): unknown => {
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
    return parsedArray.map((item) => coerceByParamType(childParam, item, unit));
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
        coerceByParamType(component, parsedTuple[index], unit),
      );
    }

    if (parsedTuple && typeof parsedTuple === "object") {
      return tupleComponents.map((component, index) => {
        const key = component.name || String(index);
        return coerceByParamType(
          component,
          (parsedTuple as Record<string, unknown>)[key],
          unit,
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
    return parseIntegerWithUnit(param, trimmed, unit);
  }

  if (param.baseType === "array" || param.baseType === "tuple") {
    return coerceByParamType(param, rawValue);
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonInput(trimmed, `${param.type} 参数`);
  }

  return trimmed;
};

export const parseArgumentValue = (
  type: string | AbiInputParam,
  value: string,
  unit: IntegerUnit = "wei",
) => coerceByParamType(toParamType(type), value, unit);

const parseArgumentInput = (
  input: string | AbiInputParam,
  values: string[] | ArgumentInputValues,
  units: IntegerUnit[] | ArgumentUnitValues,
  path: string,
): unknown => {
  const param = toParamType(input);
  if (isExpandableTupleParam(input)) {
    const rawTupleInput = getRawInputAtPath(values, path);
    if (rawTupleInput.trim()) {
      return coerceByParamType(param, rawTupleInput, getUnitAtPath(units, path));
    }
    return input.components.map((component, index) =>
      parseArgumentInput(component, values, units, `${path}.${index}`),
    );
  }
  return coerceByParamType(
    param,
    getRawInputAtPath(values, path),
    getUnitAtPath(units, path),
  );
};

export const parseArgumentInputs = (
  inputs: Array<string | AbiInputParam>,
  values: string[] | ArgumentInputValues,
  units: IntegerUnit[] | ArgumentUnitValues = [],
) =>
  inputs.map((input, index) =>
    parseArgumentInput(input, values, units, String(index)),
  );

export const encodeFunctionCalldata = (
  abi: any[],
  signature: string,
  inputs: Array<string | AbiInputParam>,
  rawInputs: string[] | ArgumentInputValues,
  integerUnits: IntegerUnit[] | ArgumentUnitValues = [],
) => {
  const iface = new Interface(abi);
  const args = parseArgumentInputs(inputs, rawInputs, integerUnits);
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

const getErrorFields = (error: unknown) => {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  const messages: string[] = [];
  const codes: Array<string | number> = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current === "string" && current.trim()) {
      messages.push(current.trim());
      continue;
    }

    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      [record.shortMessage, record.reason, record.message].forEach((value) => {
        if (typeof value === "string" && value.trim()) {
          messages.push(value.trim());
        }
      });
      [record.code, record.errorCode].forEach((value) => {
        if (typeof value === "string" || typeof value === "number") {
          codes.push(value);
        }
      });
      queue.push(record.error, record.info, record.data, record.cause);
    }
  }

  return { messages, codes };
};

export const isUserRejectedWalletRequest = (error: unknown) => {
  const { messages, codes } = getErrorFields(error);
  if (
    codes.some(
      (code) =>
        code === 4001 ||
        code === "4001" ||
        code === "ACTION_REJECTED" ||
        code === "USER_REJECTED" ||
        code === "USER_DISCONNECTED",
    )
  ) {
    return true;
  }

  return messages.some((message) =>
    /user rejected|user denied|request rejected|rejected the request|denied transaction|denied message|rejected by user|用户拒绝|拒绝请求|could not coalesce error/i.test(
      message,
    ),
  );
};

export const extractContractErrorMessage = (error: unknown): string => {
  if (isUserRejectedWalletRequest(error)) {
    return "用户拒绝了钱包请求";
  }

  const { messages } = getErrorFields(error);
  return messages[0] ?? "未知错误，请检查钱包弹窗、网络和合约参数";
};

export { normalizeAddressInput };
