const BIRTHDAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toDateParts(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  };
}

function normalizeBirthdayWithSeparators(value: string) {
  const sanitized = value
    .replace(/\//g, "-")
    .replace(/[^\d-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 10);

  if (!sanitized.includes("-")) {
    return null;
  }

  const segments = sanitized.split("-");
  const [yearText = "", rawMonthText = "", rawDayText = ""] = segments;
  const overflowDayText =
    segments.length === 2 && rawMonthText.length > 2 ? rawMonthText.slice(2) : "";
  const year = yearText.slice(0, 4);
  const month = rawMonthText.slice(0, 2);
  const day = `${overflowDayText}${rawDayText}`.slice(0, 2);

  let normalized = year;

  if (segments.length > 1 || sanitized.endsWith("-")) {
    normalized += "-";
  }

  normalized += month;

  if (day.length > 0 || segments.length > 2 || (sanitized.endsWith("-") && month.length > 0)) {
    normalized += "-";
  }

  normalized += day;
  return normalized.slice(0, 10);
}

function normalizeBirthdayFromDigits(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function normalizeBirthdayInput(value: string) {
  const normalizedWithSeparators = normalizeBirthdayWithSeparators(value);

  if (normalizedWithSeparators !== null) {
    return normalizedWithSeparators;
  }

  return normalizeBirthdayFromDigits(value);
}

export function normalizeBirthdayForSubmit(value: string) {
  const normalized = normalizeBirthdayInput(value.trim());
  const looseMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (looseMatch) {
    const [, year, month, day] = looseMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return normalized;
}

export function getBirthdayValidationError(
  value: string,
  options?: { required?: boolean }
) {
  const trimmed = normalizeBirthdayForSubmit(value);

  if (!trimmed) {
    return options?.required ? "生日為必填欄位" : null;
  }

  if (!BIRTHDAY_PATTERN.test(trimmed)) {
    return "請輸入 YYYY-MM-DD 格式";
  }

  const { year, month, day } = toDateParts(trimmed);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isRealDate) {
    return "請輸入有效日期";
  }

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  if (parsed.getTime() > todayUtc) {
    return "生日不能晚於今天";
  }

  return null;
}
