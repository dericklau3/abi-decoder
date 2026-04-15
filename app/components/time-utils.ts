export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
export const EASTERN_TIME_ZONE = "America/New_York";

const TIME_TEXT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

type TimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getZonedFormatter = (timeZone: string) => {
  const existing = zonedFormatterCache.get(timeZone);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  zonedFormatterCache.set(timeZone, formatter);
  return formatter;
};

const getZonedParts = (epochMs: number, timeZone: string): TimeParts => {
  const parts = getZonedFormatter(timeZone).formatToParts(new Date(epochMs));
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number.parseInt(lookup.get("year") ?? "0", 10),
    month: Number.parseInt(lookup.get("month") ?? "0", 10),
    day: Number.parseInt(lookup.get("day") ?? "0", 10),
    hour: Number.parseInt(lookup.get("hour") ?? "0", 10),
    minute: Number.parseInt(lookup.get("minute") ?? "0", 10),
    second: Number.parseInt(lookup.get("second") ?? "0", 10),
  };
};

const formatParts = (parts: TimeParts) =>
  [
    parts.year.toString().padStart(4, "0"),
    parts.month.toString().padStart(2, "0"),
    parts.day.toString().padStart(2, "0"),
  ].join("-") +
  ` ${parts.hour.toString().padStart(2, "0")}:${parts.minute
    .toString()
    .padStart(2, "0")}:${parts.second.toString().padStart(2, "0")}`;

const validateTimeParts = (parts: TimeParts) => {
  const utcDate = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  );

  if (
    utcDate.getUTCFullYear() !== parts.year ||
    utcDate.getUTCMonth() + 1 !== parts.month ||
    utcDate.getUTCDate() !== parts.day ||
    utcDate.getUTCHours() !== parts.hour ||
    utcDate.getUTCMinutes() !== parts.minute ||
    utcDate.getUTCSeconds() !== parts.second
  ) {
    throw new Error("请输入有效的日期时间");
  }
};

export const parseTimeText = (value: string): TimeParts => {
  const trimmed = value.trim();
  const match = trimmed.match(TIME_TEXT_PATTERN);
  if (!match) {
    throw new Error("请输入 YYYY-MM-DD HH:mm:ss 格式的时间");
  }

  const parts = {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
    hour: Number.parseInt(match[4], 10),
    minute: Number.parseInt(match[5], 10),
    second: Number.parseInt(match[6], 10),
  };

  validateTimeParts(parts);
  return parts;
};

export const formatTimestampSecondsInZone = (value: string, timeZone: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error("请输入有效的秒级时间戳");
  }

  const epochMs = Number.parseInt(trimmed, 10) * 1000;
  return formatParts(getZonedParts(epochMs, timeZone));
};

export const timeTextToTimestampSeconds = (value: string, timeZone: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const desired = parseTimeText(trimmed);
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );

  let guess = desiredAsUtc;
  for (let index = 0; index < 4; index += 1) {
    const actual = getZonedParts(guess, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const deltaMs = desiredAsUtc - actualAsUtc;
    if (deltaMs === 0) {
      return Math.floor(guess / 1000).toString();
    }
    guess += deltaMs;
  }

  const resolved = getZonedParts(guess, timeZone);
  if (formatParts(resolved) !== formatParts(desired)) {
    throw new Error("该时区下无法解析这个时间");
  }

  return Math.floor(guess / 1000).toString();
};
