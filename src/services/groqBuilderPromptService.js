const { normalizeText } = require("./promptService");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.GROQ_TIMEOUT_MS || "6000", 10);

const createServiceError = (message, statusCode = 503) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const compactComponent = (component) => {
  if (!component) {
    return null;
  }

  return {
    name: component.name,
    description: normalizeText(component.description || "").slice(0, 400),
    import: component.import || "",
    dependencies: Array.isArray(component.dependencies) ? component.dependencies.slice(0, 12) : [],
    usage: normalizeText(component.usage || "").slice(0, 600),
    props: Array.isArray(component.props) ? component.props.slice(0, 20) : [],
  };
};

const fallbackPrompt = ({ userPrompt, intentInfo, best, projectContext }) => {
  const theme = projectContext?.theme || {};
  return [
    "You are a senior frontend engineer. Build the requested UI component as production-ready code.",
    `User request: ${userPrompt}`,
    `Primary intent: ${intentInfo?.primary || "section"}`,
    `Secondary context: ${intentInfo?.secondary || "none"}`,
    `Features: ${(intentInfo?.features || []).join(", ") || "none"}`,
    "Reference component:",
    `- Name: ${best?.name || "N/A"}`,
    `- Import path: ${best?.import || "N/A"}`,
    "Implementation rules:",
    "1) Use the reference component structure, adapt to user request.",
    "2) Do not copy blindly; preserve reusable structure and improve UX.",
    "3) Use project theme values only; no hardcoded colors.",
    `4) Theme primary=${theme.primary || "#6366f1"}, bg=${theme.background || "#ffffff"}, text=${theme.text || "#111827"}, border=${theme.border || "#e5e7eb"}.`,
    "5) Include accessible labels/keyboard support and loading/empty/error states.",
    "6) Return complete production-ready files with no TODOs.",
  ].join("\n");
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
    prompt_guide: {
      role: promptGuide?.role,
      thinking_protocol: promptGuide?.thinking_protocol,
      how_to_use_reference_components: promptGuide?.how_to_use_reference_components,
      theme_rules: promptGuide?.theme_rules,
      output_contract: promptGuide?.output_contract,
      self_critique_protocol: promptGuide?.self_critique_protocol,
      execute: promptGuide?.execute,
    },
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
              "It must reference the selected component details, real theme values, required states, accessibility, and strict quality constraints.",
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
};
