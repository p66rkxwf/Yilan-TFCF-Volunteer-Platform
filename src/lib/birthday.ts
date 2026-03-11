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
    .replace(/-+/g, "-");

  if (!sanitized.includes("-")) {
    return null;
  }

  const segments = sanitized.split("-").slice(0, 3);
  const [year = "", month = "", day = ""] = segments;

  let normalized = year.slice(0, 4);

  if (segments.length > 1) {
    normalized += `-${month.slice(0, 2)}`;
  }

  if (segments.length > 2) {
    normalized += `-${day.slice(0, 2)}`;
  }

  return normalized.slice(0, 10);
}

export function normalizeBirthdayInput(value: string) {
  const normalizedWithSeparators = normalizeBirthdayWithSeparators(value);

  if (normalizedWithSeparators !== null) {
    return normalizedWithSeparators;
  }

  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function normalizeBirthdayForSubmit(value: string) {
  const trimmed = value.trim().replace(/\//g, "-");
  const looseMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (looseMatch) {
    const [, year, month, day] = looseMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return normalizeBirthdayInput(trimmed);
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
