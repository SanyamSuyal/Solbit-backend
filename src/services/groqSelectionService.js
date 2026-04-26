const { normalizeText } = require("./promptService");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.GROQ_TIMEOUT_MS || "6000", 10);

const createServiceError = (message, statusCode = 503) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const summarizeCandidate = (candidate, index) => {
  return {
    index,
    name: candidate?.name || "",
    uiPattern: candidate?.uiPattern || "",
    semanticTags: Array.isArray(candidate?.semanticTags) ? candidate.semanticTags.slice(0, 10) : [],
    description: normalizeText(candidate?.description || "").slice(0, 280),
    dependencies: Array.isArray(candidate?.dependencies) ? candidate.dependencies.slice(0, 6) : [],
    usage: normalizeText(candidate?.usage || "").slice(0, 220),
    score: Number(candidate?.score || 0),
  };
};

const parseChoice = (content, maxIndex) => {
  try {
    const parsed = JSON.parse(String(content || "").trim());
    const index = Number.parseInt(parsed?.bestIndex, 10);
    if (Number.isInteger(index) && index >= 0 && index <= maxIndex) {
      return index;
    }
    return null;
  } catch {
    return null;
  }
};

const selectBestResultWithGroq = async ({ prompt, intentInfo, candidates }) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw createServiceError("Groq selector is not configured. Set GROQ_API_KEY.", 503);
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return 0;
  }

  const compactCandidates = candidates.slice(0, 6).map((candidate, idx) => summarizeCandidate(candidate, idx));

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
              "Choose the best UI component candidate for the user prompt and intent. Return only JSON with {\"bestIndex\": number}. No explanation.",
          },
          {
            role: "user",
            content: JSON.stringify({
              prompt,
              intent: intentInfo,
              candidates: compactCandidates,
              rules: [
                "Prioritize direct prompt fit and primary intent.",
                "Use secondary context and features as tie-breakers.",
                "Return exactly one index from candidates.",
              ],
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw createServiceError(`Groq selector request failed (${response.status}): ${body}`, 502);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const selectedIndex = parseChoice(content, compactCandidates.length - 1);

    if (selectedIndex === null) {
      throw createServiceError("Groq selector returned invalid choice payload.", 502);
    }

    return selectedIndex;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createServiceError("Groq selector timed out.", 504);
    }

    if (typeof error?.statusCode === "number") {
      throw error;
    }

    throw createServiceError("Groq selector failed.", 502);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

module.exports = {
  selectBestResultWithGroq,
};
