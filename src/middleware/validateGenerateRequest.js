const normalizeText = (value) => value.toLowerCase().trim().replace(/\s+/g, " ");

const sanitizePrompt = (value) => value.replace(/[<>$`{}]/g, " ");

const inferFrameworkFromPrompt = (prompt, fallback) => {
  const text = normalizeText(prompt);
  if (/\bvite\b|\breact\b/.test(text)) {
    return "react";
  }
  if (/\bnext\b|\bnextjs\b|\bnext\.js\b/.test(text)) {
    return "nextjs";
  }
  return fallback;
};

const inferStylingFromPrompt = (prompt, fallback) => {
  const text = normalizeText(prompt);
  if (/\btailwind\b/.test(text)) {
    return "tailwind";
  }
  if (/\bcss modules\b/.test(text)) {
    return "css-modules";
  }
  return fallback;
};

const inferThemeFromPrompt = (prompt) => {
  const text = normalizeText(prompt);
  const darkMode = /\bdark\b|\bdark mode\b|\bnight\b|\bblack\b/.test(text);
  const monospace = /\bmono\b|\bmonospace\b/.test(text);
  const brutalist = /\bbrutalist\b/.test(text);

  return {
    darkMode,
    fonts: {
      body: monospace ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : undefined,
    },
    ...(darkMode
      ? {
          background: "#0b0b0c",
          text: "#f5f5f5",
          border: "#2a2a2d",
          primary: brutalist ? "#f97316" : undefined,
        }
      : {}),
    ...(brutalist ? { borderRadius: "0px" } : {}),
  };
};

const mergeTheme = (baseTheme, inferredTheme) => {
  const merged = {
    ...(baseTheme || {}),
    ...(inferredTheme || {}),
    fonts: {
      ...((baseTheme && baseTheme.fonts) || {}),
      ...(((inferredTheme && inferredTheme.fonts) || {})),
    },
  };

  if (!merged.fonts?.body) {
    delete merged.fonts;
  }

  return merged;
};

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

  const normalizedFrameworkInput = typeof framework === "string" ? normalizeText(framework) : "nextjs";
  const normalizedStylingInput = typeof styling === "string" ? normalizeText(styling) : "tailwind";

  const normalizedFramework = inferFrameworkFromPrompt(normalizedPrompt, normalizedFrameworkInput);
  const normalizedStyling = inferStylingFromPrompt(normalizedPrompt, normalizedStylingInput);
  const normalizedProjectContext = normalizeProjectContext(projectContext, normalizedFramework, normalizedStyling);
  const inferredTheme = inferThemeFromPrompt(normalizedPrompt);

  req.generateRequest = {
    prompt: normalizedPrompt,
    framework: normalizedFramework,
    styling: normalizedStyling,
    aiSelection: typeof aiSelection === "boolean" ? aiSelection : null,
    projectContext: {
      ...normalizedProjectContext,
      theme: mergeTheme(normalizedProjectContext.theme, inferredTheme),
    },
  };

  return next();
};

module.exports = validateGenerateRequest;
