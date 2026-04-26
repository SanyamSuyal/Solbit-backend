const { normalizeText } = require("./promptService");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.GROQ_BUILDER_TIMEOUT_MS || process.env.GROQ_TIMEOUT_MS || "12000", 10);

const LLM_CALL_SYSTEM_PROMPT = [
  "You are a senior frontend engineer generating production-ready component code.",
  "Return complete files only, with no TODO/FIXME placeholders and no ellipses.",
  "Use provided component context as the primary structural base and adapt it to the user request.",
  "Respect theme values from project_context and keep output accessible with loading/empty/error states.",
].join(" ");

const createServiceError = (message, statusCode = 503) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const compactComponent = (component) => {
  if (!component) {
    return null;
  }

  const code = String(component.code || "");
  const codeLines = code
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const codeExcerpt = codeLines.slice(0, 120).join("\n").slice(0, 6000);

  return {
    name: component.name,
    description: normalizeText(component.description || "").slice(0, 400),
    import: component.import || "",
    dependencies: Array.isArray(component.dependencies) ? component.dependencies.slice(0, 12) : [],
    usage: normalizeText(component.usage || "").slice(0, 600),
    props: Array.isArray(component.props) ? component.props.slice(0, 20) : [],
    code_excerpt: codeExcerpt,
  };
};

const isLikelyCodeInsteadOfPrompt = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }

  const codeSignals = [
    /```/,
    /\bimport\s+.+\s+from\s+['"][^'"]+['"]/,
    /\bexport\s+default\b/,
    /\bmodule\.exports\b/,
    /\bfunction\s+[A-Za-z0-9_]+\s*\(/,
    /\bconst\s+[A-Za-z0-9_]+\s*=\s*\(/,
    /<\/?[A-Za-z][^>]*>/,
  ];

  return codeSignals.some((pattern) => pattern.test(text));
};

const buildExecutionPromptText = ({ userPrompt, intentInfo, projectContext, best, alternatives, promptGuide }) => {
  const theme = projectContext?.theme || {};
  const spacing = theme.spacing || {};

  return [
    "TASK",
    `Build the component requested by the user: \"${userPrompt}\".`,
    "",
    "INTENT",
    `- Primary: ${intentInfo?.primary || "section"}`,
    `- Secondary: ${intentInfo?.secondary || "none"}`,
    `- Features: ${(intentInfo?.features || []).join(", ") || "none"}`,
    "",
    "REFERENCE COMPONENTS",
    "- Use component_context.best as the main base.",
    "- Use component_context.alternatives for patterns and edge-case support.",
    "- Never copy-paste blindly; adapt structure to the exact user request.",
    "",
    "THEME RULES",
    `- Primary: ${theme.primary || "#6366f1"}`,
    `- Background: ${theme.background || "#ffffff"}`,
    `- Text: ${theme.text || "#111827"}`,
    `- Border: ${theme.border || "#e5e7eb"}`,
    `- Body font: ${theme?.fonts?.body || "Inter, system-ui, sans-serif"}`,
    `- Spacing sm/md/lg: ${spacing.sm || "8px"}, ${spacing.md || "12px"}, ${spacing.lg || "16px"}`,
    `- Border radius: ${theme.borderRadius || "8px"}`,
    `- Dark mode enabled: ${Boolean(theme.darkMode)}`,
    "",
    "OUTPUT REQUIREMENTS",
    "- Return complete production-ready code files only.",
    "- Include imports, component code, and any styles needed.",
    "- Handle loading, empty, error, and disabled states where relevant.",
    "- Add accessibility attributes and keyboard-safe interactions.",
    "- If TypeScript is enabled, include explicit prop/function/return types.",
    "",
    "PROMPT GUIDE EXECUTION",
    `- Follow prompt_guide.role: ${promptGuide?.role || "N/A"}`,
    `- Follow prompt_guide.execute: ${promptGuide?.execute || "N/A"}`,
    "",
    "CONSTRAINT",
    "- Do not ask follow-up questions. Make reasonable production decisions and ship.",
  ].join("\n");
};

const buildLlmCallPayload = ({ userPrompt, intentInfo, projectContext, best, alternatives, promptGuide, generatedPrompt }) => {
  const promptText = String(generatedPrompt || "").trim();

  return {
    model_role: "code_generation",
    system: LLM_CALL_SYSTEM_PROMPT,
    user: promptText,
    prompt_rules: promptGuide,
    project_context: projectContext,
    component_context: {
      best: best || null,
      alternatives: Array.isArray(alternatives) ? alternatives : [],
    },
    request_context: {
      user_prompt: userPrompt,
      intent: intentInfo,
    },
  };
};

const compactPromptGuide = (promptGuide) => {
  return {
    role: promptGuide?.role,
    theme_rules: promptGuide?.theme_rules,
    output_contract: promptGuide?.output_contract,
    execute: promptGuide?.execute,
  };
};

const fallbackPrompt = ({ userPrompt, intentInfo, best, projectContext }) => {
  return buildExecutionPromptText({
    userPrompt,
    intentInfo,
    best,
    alternatives: [],
    projectContext,
    promptGuide: {
      role: "You are a senior frontend engineer shipping complete component code.",
      execute: "Build from the reference context and return complete files.",
    },
  });
};

const generateBuilderPromptWithGroq = async ({
  userPrompt,
  intentInfo,
  best,
  alternatives,
  projectContext,
  promptGuide,
}) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw createServiceError("Groq builder prompt service is not configured. Set GROQ_API_KEY.", 503);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const payload = {
    user_request: userPrompt,
    intent: intentInfo,
    project_context: projectContext,
    selected_reference: compactComponent(best),
    alternative_references: Array.isArray(alternatives) ? alternatives.slice(0, 2).map(compactComponent) : [],
    prompt_guide: compactPromptGuide(promptGuide),
  };

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
        messages: [
          {
            role: "system",
            content:
              "You generate a single high-quality implementation prompt for another coding AI. Output plain text only. Do not output code blocks. Do not explain yourself.",
          },
          {
            role: "user",
            content: [
              "Write one detailed implementation prompt for a coding AI.",
              "The prompt must be production-focused, specific, and executable immediately.",
              "It must reference the selected component details, code excerpt context, real theme values, required states, accessibility, and strict quality constraints.",
              "Return prompt text only.",
              JSON.stringify(payload),
            ].join("\n\n"),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw createServiceError(`Groq builder prompt request failed (${response.status}): ${body}`, 502);
    }

    const data = await response.json();
    const text = String(data?.choices?.[0]?.message?.content || "").trim();

    if (!text) {
      throw createServiceError("Groq builder prompt returned empty content.", 502);
    }

    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createServiceError("Groq builder prompt timed out.", 504);
    }
    if (typeof error?.statusCode === "number") {
      throw error;
    }
    throw createServiceError("Groq builder prompt generation failed.", 502);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

module.exports = {
  generateBuilderPromptWithGroq,
  fallbackPrompt,
  buildExecutionPromptText,
  buildLlmCallPayload,
  isLikelyCodeInsteadOfPrompt,
};
