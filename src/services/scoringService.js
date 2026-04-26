const { normalizeText, getIntentAliases } = require("./promptService");

const toComparableText = (value) => normalizeText(value);

const countTokenMatches = (tokens, value) => {
  const text = toComparableText(value);
  return tokens.reduce((count, token) => (text.includes(token) ? count + 1 : count), 0);
};

const normalizeArray = (values) => {
  return Array.isArray(values) ? values.map((value) => normalizeText(value)).filter(Boolean) : [];
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasTermMatch = (text, term) => {
  if (!text || !term) {
    return false;
  }
  const escaped = escapeRegex(term);
  const matcher = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`);
  return matcher.test(` ${text} `);
};

const computeComponentScore = (component, keywords, intentInfo = {}, modifiers = []) => {
  const primaryIntent = normalizeText(intentInfo.primary || "");
  const secondaryIntent = normalizeText(intentInfo.secondary || "");
  const intentFeatures = Array.isArray(intentInfo.features)
    ? intentInfo.features.map((feature) => normalizeText(feature)).filter(Boolean)
    : [];

  const semanticTags = normalizeArray(component.semanticTags && component.semanticTags.length > 0 ? component.semanticTags : component.tags);
  const normalizedSearchText = normalizeText(component.searchText || component.description || "");
  const normalizedUiPattern = toComparableText(component.uiPattern || "");
  const intentAliases = getIntentAliases(primaryIntent);

  const semanticMatchCount = semanticTags.reduce((count, tag) => {
    return keywords.some((keyword) => tag.includes(keyword)) ? count + 1 : count;
  }, 0);

  const searchTextMatches = countTokenMatches(keywords, normalizedSearchText);
  const exactPatternMatch = intentAliases.length > 0
    ? Number(intentAliases.some((intentAlias) => hasTermMatch(normalizedUiPattern, intentAlias)))
    : 0;

  const partialPatternMatch = intentAliases.length > 0
    ? Number(intentAliases.some((intentAlias) => semanticTags.some((tag) => hasTermMatch(tag, intentAlias))))
    : 0;

  const modifierMatchCount = (modifiers || []).reduce((count, modifier) => {
    return hasTermMatch(normalizedSearchText, normalizeText(modifier)) ? count + 1 : count;
  }, 0);

  const secondaryMatch = secondaryIntent
    ? Number(
        hasTermMatch(normalizedSearchText, secondaryIntent) ||
          semanticTags.some((tag) => hasTermMatch(tag, secondaryIntent))
      )
    : 0;

  const featureMatchCount = intentFeatures.reduce((count, feature) => {
    return hasTermMatch(normalizedSearchText, feature) || semanticTags.some((tag) => hasTermMatch(tag, feature))
      ? count + 1
      : count;
  }, 0);

  const qualityScore = Number(component.qualityScore) || 0;
  const popularity = Number(component.popularity) || 0;
  
  // CRITICAL FIX: Enforce intent dominance and cap quality/popularity influence
  // Intent match now worth 50 points (increased from 30) to ensure UI-relevant components rank higher
  const exactPatternBoost = exactPatternMatch * 50;
  const partialPatternBoost = exactPatternMatch === 0 ? partialPatternMatch * 15 : 0;
  
  // Cap quality and popularity contributions to prevent high-quality unrelated components from dominating
  const qualityCapped = Math.min(qualityScore * 0.1, 10);
  const popularityCapped = Math.min(popularity * 0.05, 5);
  
  // Penalize logic/developer-tool components to prioritize UI components
  const logicPenalty = component.componentClass === "logic" ? -25 : 0;

  const score =
    exactPatternBoost +
    partialPatternBoost +
    semanticMatchCount * 8 +
    searchTextMatches * 5 +
    secondaryMatch * 6 +
    featureMatchCount * 4 +
    modifierMatchCount * 2 +
    qualityCapped +
    popularityCapped +
    logicPenalty;

  return {
    score,
    details: {
      intentMatch: exactPatternMatch || partialPatternMatch,
      exactPatternMatch,
      partialPatternMatch,
      secondaryMatch,
      featureMatchCount,
      modifierMatchCount,
      semanticMatchCount,
      searchTextMatches,
      qualityScore,
      popularity,
      logicPenalty,
    },
  };
};

module.exports = {
  computeComponentScore,
};
