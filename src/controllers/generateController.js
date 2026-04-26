const { extractKeywords } = require("../services/promptService");
const { parseIntentWithGroq } = require("../services/groqIntentService");
const { selectBestResultWithGroq } = require("../services/groqSelectionService");
const {
  generateBuilderPromptWithGroq,
  fallbackPrompt,
  buildExecutionPromptText,
  buildLlmCallPayload,
  isLikelyCodeInsteadOfPrompt,
} = require("../services/groqBuilderPromptService");
const { buildPromptGuide, normalizeProjectContext } = require("../services/promptGuideService");
const { retrieveComponents } = require("../services/componentRetrievalService");

const LLM_GUIDANCE = {
  instructions:
    "After receiving this component, integrate it cleanly into the existing project. Ensure imports are correct, dependencies are installed, and adapt styling to match the current UI. Do not hallucinate missing parts. Prefer modifying existing layout instead of rewriting everything.",
};

const shouldUseAiSelection = (req) => {
  if (typeof req.generateRequest?.aiSelection === "boolean") {
    return req.generateRequest.aiSelection;
  }

  // AI best-selection is primary by default; can be disabled via env.
  const envValue = String(process.env.GROQ_SELECT_BEST || "true").toLowerCase();
  return envValue !== "false";
};

const generateComponents = async (req, res, next) => {
  try {
    const { prompt, framework, styling, projectContext } = req.generateRequest;
    const intentInfo = await parseIntentWithGroq(prompt);
    const keywords = extractKeywords(prompt);
    const modifiers = [
      ...(Array.isArray(intentInfo.features) ? intentInfo.features : []),
      ...(intentInfo.secondary ? [intentInfo.secondary] : []),
    ];

    const retrieval = await retrieveComponents({
      prompt,
      keywords,
      intentInfo,
      modifiers,
      framework,
      styling,
    });

    const aiPool = Array.isArray(retrieval.aiSelectionPool) && retrieval.aiSelectionPool.length > 0
      ? retrieval.aiSelectionPool
      : [retrieval.best, ...retrieval.alternatives].filter(Boolean);

    let results = [retrieval.best, ...retrieval.alternatives].filter(Boolean);
    let best = retrieval.best;
    let alternatives = retrieval.alternatives;
    let selectedByAi = false;

    if (shouldUseAiSelection(req) && aiPool.length > 1) {
      try {
        const bestIndex = await selectBestResultWithGroq({
          prompt,
          intentInfo,
          candidates: aiPool,
        });

        const selected = aiPool[bestIndex];
        const rest = aiPool.filter((_, index) => index !== bestIndex).slice(0, 4);

        best = selected;
        alternatives = rest;
        results = [selected, ...rest];
        selectedByAi = true;
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Groq best-result selection failed; falling back to retrieval ranking:", error.message);
        }
      }
    }

    const normalizedProjectContext = normalizeProjectContext(projectContext);
    const promptGuide = buildPromptGuide(normalizedProjectContext);

    let generatedPrompt = "";
    let generatedPromptSource = "groq";

    try {
      generatedPrompt = await generateBuilderPromptWithGroq({
        userPrompt: prompt,
        intentInfo,
        best,
        alternatives,
        projectContext: normalizedProjectContext,
        promptGuide,
      });
    } catch (error) {
      generatedPrompt = fallbackPrompt({
        userPrompt: prompt,
        intentInfo,
        best,
        projectContext: normalizedProjectContext,
      });
      generatedPromptSource = "fallback";

      if (process.env.NODE_ENV !== "production") {
        console.warn("Groq generated prompt failed; fallback prompt used:", error.message);
      }
    }

    if (isLikelyCodeInsteadOfPrompt(generatedPrompt)) {
      generatedPrompt = buildExecutionPromptText({
        userPrompt: prompt,
        intentInfo,
        best,
        alternatives,
        projectContext: normalizedProjectContext,
        promptGuide,
      });
      generatedPromptSource = "rule_based_prompt_builder";
    }

    const llmCallPayload = buildLlmCallPayload({
      userPrompt: prompt,
      intentInfo,
      best,
      alternatives,
      projectContext: normalizedProjectContext,
      promptGuide,
      generatedPrompt,
    });

    return res.json({
      intent: intentInfo,
      project_context: normalizedProjectContext,
      best,
      alternatives,
      results,
      prompt_guide: promptGuide,
      generated_prompt: {
        source: generatedPromptSource,
        text: generatedPrompt,
      },
      llm_call: llmCallPayload,
      selection: {
        mode: selectedByAi ? "groq" : "retrieval",
      },
      llmGuidance: LLM_GUIDANCE,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  generateComponents,
};
