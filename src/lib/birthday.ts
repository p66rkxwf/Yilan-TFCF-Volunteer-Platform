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
  const [yearText = "", monthText = "", dayText = ""] = segments;
  const year = yearText.slice(0, 4);
  const month = monthText.slice(0, 2);
  const day = dayText.slice(0, 2);
  const autoAdvanceToDay =
    year.length === 4 &&
    month.length === 1 &&
    Number(month) >= 2 &&
    segments.length === 2 &&
    !sanitized.endsWith("-");
  const monthDisplay =
    month.length === 1 &&
    (segments.length > 2 || sanitized.endsWith("-") || autoAdvanceToDay)
      ? month.padStart(2, "0")
      : month;

  let normalized = year;

  if (segments.length > 1 || sanitized.endsWith("-")) {
    normalized += "-";
  }

  normalized += monthDisplay;

  if (segments.length > 2 || sanitized.endsWith("-") || autoAdvanceToDay) {
    normalized += "-";
  }

  normalized += day;
  return normalized.slice(0, 10);
}

function parseMonthAndDayFromDigits(rest: string) {
  const first = rest[0];

  if (!first) {
    return { month: "", day: "", isMonthComplete: false, autoAdvanceToDay: false };
  }

  if (first === "0") {
    if (rest.length === 1) {
      return { month: "0", day: "", isMonthComplete: false, autoAdvanceToDay: false };
    }

    return {
      month: `0${rest[1]}`,
      day: rest.slice(2, 4),
      isMonthComplete: true,
      autoAdvanceToDay: false,
    };
  }

  if (Number(first) >= 2) {
    return {
      month: `0${first}`,
      day: rest.slice(1, 3),
      isMonthComplete: true,
      autoAdvanceToDay: true,
    };
  }

  if (rest.length === 1) {
    return { month: "1", day: "", isMonthComplete: false, autoAdvanceToDay: false };
  }

  const second = rest[1];

  if (Number(second) <= 2) {
    return {
      month: `1${second}`,
      day: rest.slice(2, 4),
      isMonthComplete: true,
      autoAdvanceToDay: false,
    };
  }

  return {
    month: "01",
    day: rest.slice(1, 3),
    isMonthComplete: true,
    autoAdvanceToDay: true,
  };
}

function formatBirthdayDigits(digits: string, value: string) {
  const hasTrailingSeparator = /[-/]$/.test(value.trim());

  if (digits.length <= 4) {
    return digits.length === 4 && hasTrailingSeparator ? `${digits}-` : digits;
  }

  const year = digits.slice(0, 4);
  const { month, day, isMonthComplete, autoAdvanceToDay } = parseMonthAndDayFromDigits(
    digits.slice(4)
  );

  if (!isMonthComplete) {
    if (hasTrailingSeparator && month.length === 1 && Number(month) >= 1) {
      return `${year}-${month.padStart(2, "0")}-`;
    }

    return `${year}-${month}`;
  }

  let formatted = `${year}-${month}`;

  if (day.length > 0 || autoAdvanceToDay || hasTrailingSeparator) {
    formatted += `-${day}`;
  }

  return formatted;
}

export function normalizeBirthdayInput(value: string) {
  const normalizedWithSeparators = normalizeBirthdayWithSeparators(value);

  if (normalizedWithSeparators !== null) {
    return normalizedWithSeparators;
  }

  const digits = value.replace(/\D/g, "").slice(0, 8);
  return formatBirthdayDigits(digits, value);
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
