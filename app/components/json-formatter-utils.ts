export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const formatJsonParseError = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return `JSON 格式错误：${error.message}`;
  }

  return "JSON 格式错误，请检查输入内容";
};

export const formatJsonInput = (input: string) => {
  try {
    const value = JSON.parse(input) as JsonValue;
    return {
      value,
      pretty: JSON.stringify(value, null, 2),
    };
  } catch (error) {
    throw new Error(formatJsonParseError(error));
  }
};

export const serializeJsonValueForCopy = (value: JsonValue) => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return JSON.stringify(value, null, 2);
};
