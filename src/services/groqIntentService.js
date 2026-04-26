const { normalizeText } = require("./promptService");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.GROQ_TIMEOUT_MS || "6000", 10);

const createServiceError = (message, statusCode = 503) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const PRIMARY_CANONICAL_MAP = {
  input: "form",
  search: "form",
  searchbar: "form",
  search_bar: "form",
  signup: "form",
  signinform: "form",
  signupbox: "form",
  pricing: "section",
  pricingsection: "section",
  subscriptionplans: "section",
  plans: "section",
  plan: "section",
  textfield: "form",
  textbox: "form",
  dialog: "modal",
  popup: "modal",
  datatable: "table",
  grid: "table",
  topmenubar: "navbar",
  menubar: "navbar",
  navigationbar: "navbar",
  leftnavigationpanel: "sidebar",
  sidenav: "sidebar",
  menu: "dropdown",
  preview: "viewer",
  previewer: "viewer",
  codeviewer: "viewer",
  inspector: "viewer",
};

const ALLOWED_PRIMARY = new Set([
  "navbar",
  "sidebar",
  "tabs",
  "modal",
  "form",
  "card",
  "table",
  "dropdown",
  "tooltip",
  "hero",
  "section",
  "chart",
  "image",
  "loader",
  "badge",
  "overlay",
  "layout",
  "viewer",
  "editor",
  "dashboard",
  "logic",
  "other",
]);

const stripCodeFences = (value) => {
  const text = String(value || "").trim();
  if (!text.startsWith("```")) {
    return text;
  }

  return text
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
};

const safeParseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const canonicalizePrimary = (primary) => {
  const normalized = normalizeText(primary || "").replace(/\s+/g, "");
  const mapped = PRIMARY_CANONICAL_MAP[normalized] || normalizeText(primary);
  // Never return "other" for intent parsing; fallback to closest broad section pattern.
  return ALLOWED_PRIMARY.has(mapped) && mapped !== "other" ? mapped : "section";
};

const normalizeFeatures = (features) => {
  if (!Array.isArray(features)) {
    return [];
  }

  const seen = new Set();
  const out = [];

  for (const value of features) {
    const token = normalizeText(value);
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    out.push(token);
  }

  return out.slice(0, 8);
};

const normalizeIntentObject = (payload) => {
  const primary = canonicalizePrimary(payload?.primary);
  const secondary = normalizeText(payload?.secondary || "") || null;
  const features = normalizeFeatures(payload?.features);

  return {
    primary,
    secondary,
    features,
  };
};

const inferContextFromPrompt = (normalizedPrompt) => {
  if (/\bsidebar\b/.test(normalizedPrompt)) {
    return "sidebar";
  }
  if (/\bnavbar\b|\bnav\b/.test(normalizedPrompt)) {
    return "navbar";
  }
  if (/\bdashboard\b/.test(normalizedPrompt)) {
    return "dashboard";
  }
  return null;
};

const applyPrimaryPurposeGuard = (prompt, intent) => {
  const normalizedPrompt = normalizeText(prompt);
  const context = inferContextFromPrompt(normalizedPrompt);

  // Enforce purpose-first intent for "input/form inside sidebar/navbar/dashboard" style prompts.
  const isFormLikeRequest =
    /\b(input|form|email|search\s*bar|search|textfield|text\s*field|textarea|password|otp)\b/.test(normalizedPrompt);

  const looksLikeContextPrimary = ["sidebar", "navbar", "dashboard", "layout"].includes(intent.primary);

  if (isFormLikeRequest && context && (looksLikeContextPrimary || intent.primary === "other")) {
    const nextFeatures = new Set(intent.features || []);

    if (/\bemail\b/.test(normalizedPrompt)) {
      nextFeatures.add("email");
    }
    if (/\binput\b|textfield|text\s*field|textarea|password|otp/.test(normalizedPrompt)) {
      nextFeatures.add("input");
    }
    if (/\bsearch\b/.test(normalizedPrompt)) {
      nextFeatures.add("search");
    }

    return {
      primary: "form",
      secondary: context,
      features: Array.from(nextFeatures).slice(0, 8),
    };
  }

  return intent;
};

const buildPrompt = (prompt) => {
  return [
    "You are an advanced intent parser for a UI component system (Solbit).",
    "Your job is to convert ANY frontend-related request into a correct UI component understanding.",
    "",
    "CORE RESPONSIBILITY:",
    "Understand what UI component the request is referring to, even if wording is unclear, indirect, or creative.",
    "Always map to a real UI pattern.",
    "",
    "SUPPORTED UI ENVIRONMENTS:",
    "navbar, sidebar, hero section, pricing section, cards, dashboard layouts, tables, forms, inputs, modals, dropdowns, tooltips, viewers/editors, landing sections.",
    "Understand both structure (layout) and elements (child components).",
    "",
    "CRITICAL RULES:",
    "1) NEVER return other.",
    "2) ALWAYS map to closest valid UI pattern.",
    "3) If wording is vague, infer intelligently.",
    "4) Think like a frontend developer, not a keyword matcher.",
    "",
    "SMART MATCHING:",
    "If not explicit, map to closest equivalent.",
    "subscription plans section -> pricing section",
    "top menu bar -> navbar",
    "left navigation panel -> sidebar",
    "pricing cards with plans -> pricing section",
    "signup box -> form",
    "",
    "CONTEXT UNDERSTANDING:",
    "fintech dashboard can imply navbar/sidebar/cards.",
    "saas landing page can imply hero/pricing/cta sections.",
    "",
    "FEATURE EXTRACTION:",
    "Extract concrete features like search, dropdown, icons, responsive, cards, tiers, cta buttons.",
    "",
    "FALLBACK LOGIC:",
    "If unclear, choose MOST LIKELY component, never random.",
    "section showing plans -> pricing section.",
    "",
    "OUTPUT FORMAT:",
    "Return ONLY structured JSON:",
    '{"primary":"...","secondary":"...","features":[]}',
    "",
    "FINAL PRINCIPLE:",
    "You are a frontend architect that understands UI systems deeply.",
    "Always choose the closest meaningful component.",
    "Prompt:",
    prompt,
  ].join("\n");
};

const parseIntentWithGroq = async (prompt) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw createServiceError("Groq intent parser is not configured. Set GROQ_API_KEY.", 503);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Solbit intent parser. Return only strict JSON {\"primary\": string, \"secondary\": string|null, \"features\": string[]}. Never return other for primary. Use closest valid UI pattern.",
          },
          {
            role: "user",
            content: buildPrompt(prompt),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw createServiceError(`Groq intent parser request failed (${response.status}): ${body}`, 502);
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw createServiceError("Groq intent parser returned an empty response.", 502);
    }

    const cleaned = stripCodeFences(rawContent);
    const parsed = safeParseJson(cleaned);

    if (!parsed) {
      throw createServiceError("Groq intent parser returned invalid JSON.", 502);
    }

    const normalizedIntent = normalizeIntentObject(parsed);
    return applyPrimaryPurposeGuard(prompt, normalizedIntent);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createServiceError("Groq intent parser timed out.", 504);
    }

    if (typeof error?.statusCode === "number") {
      throw error;
    }

    throw createServiceError("Groq intent parser failed.", 502);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

module.exports = {
  parseIntentWithGroq,
  canonicalizePrimary,
};
