const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "with",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "from",
  "by",
  "is",
  "be",
  "that",
  "this",
  "it",
  "component",
  "components",
  "section",
  "sections",
  "system",
  "ui",
  "background",
]);

const INTENT_CANDIDATES = ["sidebar", "navbar", "footer", "dashboard", "form", "modal", "card", "tabs", "tab"];
const PATTERN_SYNONYMS = {
  navbar: ["navbar", "header", "navigation menu"],
  sidebar: ["sidebar", "side nav", "sidenav"],
  tabs: ["tabs", "tab"],
  footer: ["footer"],
  form: ["form"],
  modal: ["modal", "dialog"],
  card: ["card"],
  dashboard: ["dashboard"],
};

const normalizeText = (value) => {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const extractIntent = (prompt) => {
  const normalizedPrompt = normalizeText(prompt);

  // Prefer explicit "<intent> component" patterns when present.
  const explicitIntentMatch = normalizedPrompt.match(/\b([a-z0-9]+)\s+components?\b/);
  if (explicitIntentMatch?.[1]) {
    const explicitIntent = explicitIntentMatch[1] === "tab" ? "tabs" : explicitIntentMatch[1];
    if (!STOP_WORDS.has(explicitIntent)) {
      return explicitIntent;
    }
  }

  for (const candidate of INTENT_CANDIDATES) {
    if (normalizedPrompt.includes(candidate)) {
      return candidate === "tab" ? "tabs" : candidate;
    }
  }

  // Fallback: first meaningful token from prompt.
  const fallbackToken = normalizedPrompt
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .find((token) => token.length > 1 && !STOP_WORDS.has(token));

  if (fallbackToken) {
    return fallbackToken === "tab" ? "tabs" : fallbackToken;
  }

  return null;
};

const getIntentAliases = (intent) => {
  const normalizedIntent = normalizeText(intent);
  if (!normalizedIntent) {
    return [];
  }

  const aliases = new Set([normalizedIntent]);
  const mapped = PATTERN_SYNONYMS[normalizedIntent] || [];
  mapped.forEach((item) => aliases.add(normalizeText(item)));

  if (normalizedIntent.endsWith("s")) {
    aliases.add(normalizedIntent.slice(0, -1));
  } else {
    aliases.add(`${normalizedIntent}s`);
  }

  return Array.from(aliases).filter(Boolean);
};

const extractModifiers = (prompt, intent) => {
  const intentAliases = new Set(getIntentAliases(intent));

  return normalizeText(prompt)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !intentAliases.has(token));
};

const extractKeywords = (normalizedPrompt) => {
  return normalizeText(normalizedPrompt)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
};

module.exports = {
  extractKeywords,
  extractIntent,
  extractModifiers,
  getIntentAliases,
  normalizeText,
};
