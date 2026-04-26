const normalizeText = (value) => value.toLowerCase().trim().replace(/\s+/g, " ");

const sanitizePrompt = (value) => value.replace(/[<>$`{}]/g, " ");

const normalizeProjectContext = (input, framework, styling) => {
  if (!input || typeof input !== "object") {
    return {
      framework,
      styling,
      typescript: false,
      theme: {},
    };
  }

  return {
    framework: typeof input.framework === "string" ? normalizeText(input.framework) : framework,
    styling: typeof input.styling === "string" ? normalizeText(input.styling) : styling,
    typescript: Boolean(input.typescript),
    theme: input.theme && typeof input.theme === "object" ? input.theme : {},
  };
};

const validateGenerateRequest = (req, res, next) => {
  const { prompt, framework = "nextjs", styling = "tailwind", aiSelection, project_context: projectContext } = req.body || {};

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "'prompt' is required and must be a non-empty string" });
  }

  const safePrompt = sanitizePrompt(prompt).slice(0, 500);
  const normalizedPrompt = normalizeText(safePrompt);

  const normalizedFramework = typeof framework === "string" ? normalizeText(framework) : "nextjs";
  const normalizedStyling = typeof styling === "string" ? normalizeText(styling) : "tailwind";

  req.generateRequest = {
    prompt: normalizedPrompt,
    framework: normalizedFramework,
    styling: normalizedStyling,
    aiSelection: typeof aiSelection === "boolean" ? aiSelection : null,
    projectContext: normalizeProjectContext(projectContext, normalizedFramework, normalizedStyling),
  };

  return next();
};

module.exports = validateGenerateRequest;
