function defaultToFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

export function parseLooseNumericInput(value) {
  if (value == null) return { ok: true, empty: true, value: 0 };
  const raw = String(value).trim();
  if (!raw) return { ok: true, empty: true, value: 0 };
  const compact = raw.replace(/\s+/g, "").replace(",", ".");
  const numericPattern = /^[+-]?(?:\d+|\d*\.\d+)$/;
  if (!numericPattern.test(compact)) return { ok: false, empty: false, value: Number.NaN };
  const numeric = Number(compact);
  if (!Number.isFinite(numeric)) return { ok: false, empty: false, value: Number.NaN };
  return { ok: true, empty: false, value: numeric };
}

export function parseSimpleArithmeticInput(value) {
  if (value == null) return { ok: true, empty: true, value: 0 };
  const raw = String(value).trim();
  if (!raw) return { ok: true, empty: true, value: 0 };
  const normalized = raw.replace(/\s+/g, "").replace(/,/g, ".");
  if (!normalized) return { ok: true, empty: true, value: 0 };
  const expressionPattern = /^[\d+\-*/().]+$/;
  if (!expressionPattern.test(normalized)) return { ok: false, empty: false, value: Number.NaN };
  let index = 0;
  function peek() {
    return normalized[index] || "";
  }
  function consume() {
    const char = normalized[index] || "";
    index += 1;
    return char;
  }
  function parseNumber() {
    let start = index;
    if (peek() === "+" || peek() === "-") consume();
    while (/\d/.test(peek())) consume();
    if (peek() === ".") {
      consume();
      while (/\d/.test(peek())) consume();
    }
    const token = normalized.slice(start, index);
    if (!token || token === "+" || token === "-" || token === ".") return Number.NaN;
    const numeric = Number(token);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }
  function parseFactor() {
    if (peek() === "(") {
      consume();
      const value = parseExpression();
      if (peek() !== ")") return Number.NaN;
      consume();
      return value;
    }
    return parseNumber();
  }
  function parseTerm() {
    let left = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      const right = parseFactor();
      if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
      if (operator === "*") left *= right;
      else {
        if (Math.abs(right) <= 1e-12) return Number.NaN;
        left /= right;
      }
    }
    return left;
  }
  function parseExpression() {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      const right = parseTerm();
      if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
      if (operator === "+") left += right;
      else left -= right;
    }
    return left;
  }
  const result = parseExpression();
  if (index !== normalized.length || !Number.isFinite(result)) {
    return { ok: false, empty: false, value: Number.NaN };
  }
  return { ok: true, empty: false, value: result };
}

export function normalizeSignedModifierInput(
  rawValue,
  fallback = 0,
  toFiniteNumber = defaultToFiniteNumber,
  parseLoose = parseLooseNumericInput
) {
  if (rawValue == null) return { value: toFiniteNumber(fallback, 0), invalid: false };
  if (typeof rawValue === "number") {
    if (!Number.isFinite(rawValue)) return { value: toFiniteNumber(fallback, 0), invalid: true };
    return { value: rawValue, invalid: false };
  }
  if (typeof rawValue === "string") {
    const parsed = parseLoose(rawValue);
    if (!parsed.ok) return { value: toFiniteNumber(fallback, 0), invalid: true };
    return { value: parsed.empty ? 0 : parsed.value, invalid: false };
  }
  const numeric = Number(rawValue);
  if (Number.isFinite(numeric)) return { value: numeric, invalid: false };
  return { value: toFiniteNumber(fallback, 0), invalid: true };
}

export function buildItemModifierErrorMessage(invalidFields = []) {
  const uniqueFields = Array.from(new Set((invalidFields || []).filter(Boolean)));
  if (!uniqueFields.length) return null;
  return `Valeur non numerique: ${uniqueFields.join(", ")}`;
}
