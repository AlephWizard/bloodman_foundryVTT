const DICE_MODIFIER_SCHEMAS = Object.freeze({
  kh: { argument: "optional-count" },
  kl: { argument: "optional-count" },
  dh: { argument: "optional-count" },
  dl: { argument: "optional-count" },
  r: { argument: "optional-compare-number" },
  rr: { argument: "optional-compare-number" },
  x: { argument: "optional-compare-number" },
  xo: { argument: "optional-compare-number" },
  cs: { argument: "optional-compare-number" },
  cf: { argument: "optional-compare-number" }
});

export const SUPPORTED_ROLL_MODIFIERS = Object.freeze(Object.keys(DICE_MODIFIER_SCHEMAS));

class RollFormulaParseError extends Error {
  constructor(message, index = 0) {
    super(message);
    this.name = "RollFormulaParseError";
    this.index = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : 0;
  }
}

function normalizeParserIndex(index, formula) {
  const length = String(formula || "").length;
  if (!Number.isFinite(Number(index))) return 0;
  return Math.max(0, Math.min(Math.floor(Number(index)), length));
}

function buildParseErrorMessage(error, formula) {
  const safeFormula = String(formula || "");
  if (!(error instanceof RollFormulaParseError)) return "Invalid dice formula.";
  const index = normalizeParserIndex(error.index, safeFormula);
  const oneBasedPosition = index + 1;
  const pointer = `${" ".repeat(index)}^`;
  const excerpt = safeFormula || "<empty>";
  return `${error.message} (position ${oneBasedPosition})\n${excerpt}\n${pointer}`;
}

function buildTokenLabel(token) {
  if (!token) return "end of formula";
  if (token.type === "EOF") return "end of formula";
  if (token.type === "NUMBER") return `number "${token.value}"`;
  if (token.type === "IDENTIFIER") return `modifier "${token.value}"`;
  return `"${token.value}"`;
}

function tokenizeRollFormula(formula) {
  const source = String(formula || "");
  const tokens = [];
  let cursor = 0;

  const pushToken = (type, value, index) => {
    tokens.push({ type, value, index });
  };

  while (cursor < source.length) {
    const char = source[cursor];

    if (/\d/.test(char)) {
      let end = cursor + 1;
      while (end < source.length && /\d/.test(source[end])) end += 1;
      pushToken("NUMBER", source.slice(cursor, end), cursor);
      cursor = end;
      continue;
    }

    if (char === "d") {
      pushToken("DICE", char, cursor);
      cursor += 1;
      continue;
    }

    if (char === "(") {
      pushToken("LPAREN", char, cursor);
      cursor += 1;
      continue;
    }
    if (char === ")") {
      pushToken("RPAREN", char, cursor);
      cursor += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      pushToken("OPERATOR", char, cursor);
      cursor += 1;
      continue;
    }

    if (char === ">" || char === "<" || char === "!" || char === "=") {
      const next = source[cursor + 1] || "";
      const doubleToken = `${char}${next}`;
      if (doubleToken === ">=" || doubleToken === "<=" || doubleToken === "==" || doubleToken === "!=") {
        pushToken("COMPARATOR", doubleToken, cursor);
        cursor += 2;
        continue;
      }
      if (char === ">" || char === "<" || char === "=") {
        pushToken("COMPARATOR", char, cursor);
        cursor += 1;
        continue;
      }
      throw new RollFormulaParseError(`Invalid comparator token "${char}".`, cursor);
    }

    if (/[a-z]/.test(char)) {
      let end = cursor + 1;
      while (end < source.length && /[a-z]/.test(source[end])) end += 1;
      pushToken("IDENTIFIER", source.slice(cursor, end), cursor);
      cursor = end;
      continue;
    }

    throw new RollFormulaParseError(`Invalid character "${char}" in dice formula.`, cursor);
  }

  pushToken("EOF", "", source.length);
  return tokens;
}

class RollFormulaParser {
  constructor(tokens) {
    this.tokens = Array.isArray(tokens) ? tokens : [{ type: "EOF", value: "", index: 0 }];
    this.cursor = 0;
  }

  peek(offset = 0) {
    const token = this.tokens[this.cursor + offset];
    return token || this.tokens[this.tokens.length - 1];
  }

  consume() {
    const token = this.peek();
    this.cursor = Math.min(this.cursor + 1, this.tokens.length - 1);
    return token;
  }

  matchType(type) {
    return this.peek().type === type;
  }

  matchOperator(operator) {
    const token = this.peek();
    return token.type === "OPERATOR" && token.value === operator;
  }

  expectType(type, message) {
    if (!this.matchType(type)) {
      throw new RollFormulaParseError(message, this.peek().index);
    }
    return this.consume();
  }

  parse() {
    this.parseExpression();
    if (!this.matchType("EOF")) {
      const token = this.peek();
      throw new RollFormulaParseError(
        `Unexpected token ${buildTokenLabel(token)}.`,
        token.index
      );
    }
  }

  parseExpression() {
    this.parseAddSub();
  }

  parseAddSub() {
    this.parseMulDiv();
    while (this.matchOperator("+") || this.matchOperator("-")) {
      this.consume();
      this.parseMulDiv();
    }
  }

  parseMulDiv() {
    this.parseUnary();
    while (this.matchOperator("*") || this.matchOperator("/")) {
      this.consume();
      this.parseUnary();
    }
  }

  parseUnary() {
    if (this.matchOperator("+") || this.matchOperator("-")) {
      this.consume();
      this.parseUnary();
      return;
    }
    this.parsePrimary();
  }

  parsePrimary() {
    if (this.matchType("LPAREN")) {
      this.consume();
      this.parseExpression();
      this.expectType("RPAREN", "Missing closing ')' in dice formula.");
      return;
    }

    if (this.matchType("NUMBER")) {
      this.consume();
      if (this.matchType("DICE")) {
        this.consume();
        this.parseDiceTermTail();
      }
      return;
    }

    if (this.matchType("DICE")) {
      this.consume();
      this.parseDiceTermTail();
      return;
    }

    throw new RollFormulaParseError(
      "Expected a number, a dice term, or '(' in dice formula.",
      this.peek().index
    );
  }

  parseDiceTermTail() {
    this.expectType("NUMBER", "A dice term must include the number of faces after 'd'.");
    this.parseDiceModifiers();
  }

  parseDiceModifiers() {
    while (this.matchType("IDENTIFIER")) {
      const modifierToken = this.peek();
      const schema = DICE_MODIFIER_SCHEMAS[modifierToken.value];
      if (!schema) {
        throw new RollFormulaParseError(
          `Unknown dice modifier "${modifierToken.value}".`,
          modifierToken.index
        );
      }
      this.consume();
      this.parseModifierArgument(schema, modifierToken);
    }
  }

  parseModifierArgument(schema, modifierToken) {
    if (!schema || schema.argument === "none") return;

    if (schema.argument === "optional-count") {
      if (this.matchType("NUMBER")) this.consume();
      return;
    }

    if (schema.argument === "optional-compare-number") {
      if (this.matchType("COMPARATOR")) {
        const comparatorToken = this.consume();
        this.expectType(
          "NUMBER",
          `Modifier "${modifierToken.value}" requires a number after "${comparatorToken.value}".`
        );
        return;
      }
      if (this.matchType("NUMBER")) {
        this.consume();
      }
      return;
    }
  }
}

function parseRollFormula(formula) {
  const tokens = tokenizeRollFormula(formula);
  const parser = new RollFormulaParser(tokens);
  parser.parse();
}

export function stripRollCommandPrefix(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^\/(?:r|roll)\b\s*/i, "").trim();
}

export function normalizeOptionalRollFormula(value) {
  const stripped = stripRollCommandPrefix(value);
  if (!stripped) return "";
  const compact = stripped.replace(/\s+/g, "");
  if (!compact) return "";
  const explicitDiceCount = compact.replace(/(^|[+\-*/(])d(\d+)/ig, "$11d$2");
  return explicitDiceCount.toLowerCase();
}

export function normalizeRollDieFormula(value, fallback = "d4") {
  const sourceValue = value ?? fallback ?? "d4";
  const normalized = normalizeOptionalRollFormula(sourceValue);
  if (!normalized) return "1d4";
  return normalized;
}

export function validateRollFormula(value, fallback = "d4", options = {}) {
  const allowEmpty = options?.allowEmpty === true;
  const useFallbackOnEmpty = options?.useFallbackOnEmpty !== false;
  const normalized = useFallbackOnEmpty
    ? normalizeRollDieFormula(value, fallback)
    : normalizeOptionalRollFormula(value);

  if (!normalized) {
    if (allowEmpty) return { valid: true, normalized: "", error: "" };
    return { valid: false, normalized: "", error: "Dice formula is empty." };
  }

  try {
    parseRollFormula(normalized);
    return { valid: true, normalized, error: "" };
  } catch (error) {
    return {
      valid: false,
      normalized,
      error: buildParseErrorMessage(error, normalized)
    };
  }
}

export function getRollFormulaValidationError(value, fallback = "d4", options = {}) {
  const validation = validateRollFormula(value, fallback, options);
  return validation.valid ? "" : validation.error;
}

export function isValidSimpleRollFormula(value, fallback = "d4") {
  return validateRollFormula(value, fallback).valid;
}
