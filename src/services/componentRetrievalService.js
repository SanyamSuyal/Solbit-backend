const Component = require("../models/Component");
const { computeComponentScore } = require("./scoringService");
const { normalizeText } = require("./promptService");

const AI_SELECTION_POOL_SIZE = 12;
const RESPONSE_RESULT_COUNT = 5;

const METADATA_PROJECTION =
  "name description import usage dependencies semanticTags searchText tags uiPattern qualityScore popularity importStatement importSource usageExample componentNature componentClass category subCategory componentType componentRole complexity useCases";

const FULL_COMPONENT_PROJECTION =
  "name description code import usage dependencies installCommand props semanticTags searchText tags uiPattern qualityScore popularity importStatement importSource usageExample propsDefinition componentNature componentClass category subCategory componentType componentRole complexity useCases";

const normalizeStyling = (styling) => {
  if (!styling) {
    return styling;
  }

  if (styling === "tailwind") {
    return "tailwindcss";
  }

  return styling;
};

const buildWhyThis = (component, scoreDetails) => {
  const reasonBits = [];

  if (scoreDetails.intentMatch > 0) {
    reasonBits.push("directly matches the requested intent");
  }

  if (scoreDetails.semanticMatchCount > 0) {
    reasonBits.push("aligns with the semantic context");
  }

  if (scoreDetails.searchTextMatches > 0) {
    reasonBits.push("fits the prompt wording and use case");
  }

  if (scoreDetails.qualityScore >= 80) {
    reasonBits.push("has strong quality");
  }

  if (scoreDetails.popularity >= 80) {
    reasonBits.push("is highly adopted");
  }

  if (reasonBits.length === 0) {
    return "Selected because it is a relevant UI match for the prompt.";
  }

  return `Selected as a strong match because it ${reasonBits.join(", ")}.`;
};

const rewriteDescription = (component, intentPrimary) => {
  const rawDescription = normalizeText(component.description || "");
  const weakDescriptionPattern = /navigation navbar for navigation scenarios|for .* scenarios|^component\b/;

  if (rawDescription && !weakDescriptionPattern.test(rawDescription)) {
    return component.description;
  }

  const name = component.name || "UI component";
  const pattern = normalizeText(intentPrimary || component.subCategory || component.uiPattern || component.category || "interface element");
  const useCases = Array.isArray(component.useCases) ? component.useCases.filter(Boolean) : [];
  const normalizedUseCases = useCases.slice(0, 2).join(" and ");
  const complexity = normalizeText(component.complexity || "");
  const complexityText = complexity ? `${complexity} complexity` : "balanced complexity";

  if (normalizedUseCases) {
    return `A ${complexityText} ${pattern} component for ${normalizedUseCases}, designed for modern ${name} integrations.`;
  }

  return `A ${complexityText} ${pattern} component designed for modern ${name} layouts.`;
};

const toResultPayload = (component, details, intentPrimary) => ({
  name: component.name,
  description: rewriteDescription(component, intentPrimary),
  code: component.code,
  import: component.import || component.importStatement || component.importSource || "",
  usage: component.usage || component.usageExample || "",
  dependencies: Array.isArray(component.dependencies)
    ? component.dependencies.map((dep) => (typeof dep === "string" ? dep : dep.source || dep.resolvedSource || dep.kind || "")).filter(Boolean)
    : [],
  installCommand: component.installCommand || "",
  props: component.props || component.propsDefinition || [],
  whyThis: buildWhyThis(component, details),
});

const toAiCandidatePayload = (component, details, intentPrimary) => ({
  ...toResultPayload(component, details, intentPrimary),
  uiPattern: component.uiPattern || "",
  semanticTags: Array.isArray(component.semanticTags) ? component.semanticTags.slice(0, 10) : [],
  score: Number(details?.finalScore || 0),
});

const selectDiverseAlternatives = (rankedItems, maxAlternatives) => {
  if (rankedItems.length <= 1 || maxAlternatives <= 0) {
    return [];
  }

  const alternatives = [];
  const patternCounts = new Map();
  const complexitySeen = new Set();

  const bestPattern = normalizeText(rankedItems[0].component.uiPattern || "unknown");
  patternCounts.set(bestPattern, 1);

  for (const item of rankedItems.slice(1)) {
    if (alternatives.length >= maxAlternatives) {
      break;
    }

    const pattern = normalizeText(item.component.uiPattern || "unknown");
    const complexity = normalizeText(item.component.complexity || "");
    const samePattern = (patternCounts.get(pattern) || 0) >= 1;
    const sameComplexity = complexity && complexitySeen.has(complexity);

    if (samePattern && sameComplexity) {
      continue;
    }

    alternatives.push(item);
    patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    if (complexity) {
      complexitySeen.add(complexity);
    }
  }

  if (alternatives.length < Math.min(2, maxAlternatives)) {
    for (const item of rankedItems.slice(1)) {
      if (alternatives.length >= maxAlternatives) {
        break;
      }
      if (alternatives.includes(item)) {
        continue;
      }
      alternatives.push(item);
    }
  }

  return alternatives;
};

const retrieveComponents = async ({ prompt, keywords, intentInfo, modifiers, framework, styling }) => {
  const primaryIntent = normalizeText(intentInfo?.primary || "");

  if (!primaryIntent) {
    return {
      best: null,
      alternatives: [],
    };
  }

  const query = {
    isValidComponent: true,
    uiPattern: primaryIntent,
  };

  if (framework) {
    query.framework = framework;
  }

  const normalizedStyling = normalizeStyling(styling);

  if (normalizedStyling) {
    query.styling = normalizedStyling;
  }

  let candidates = await Component.find(query)
    .select(METADATA_PROJECTION)
    .limit(300)
    .lean();

  // Keep strict uiPattern matching but relax framework/styling if needed.
  if (candidates.length === 0) {
    candidates = await Component.find({
      isValidComponent: true,
      uiPattern: primaryIntent,
    })
      .select(METADATA_PROJECTION)
      .limit(300)
      .lean();
  }

  const totalMatchesAfterPrimaryFilter = candidates.length;
  const candidatesForRanking = candidates;

  const ranked = candidatesForRanking
    .map((component) => {
      const scoreData = computeComponentScore(component, keywords, intentInfo, modifiers);
      return {
        component,
        score: scoreData.score,
        details: {
          ...scoreData.details,
          finalScore: scoreData.score,
        },
      };
    })
    .sort((a, b) => b.score - a.score);

  const uniqueRanked = [];
  const seenKeys = new Set();

  for (const item of ranked) {
    const dedupeKey = normalizeText(item.component.import || item.component.importStatement || item.component.importSource || item.component.name);
    if (seenKeys.has(dedupeKey)) {
      continue;
    }
    seenKeys.add(dedupeKey);
    uniqueRanked.push(item);
  }

  const aiSelectionPoolMeta = uniqueRanked.slice(0, Math.min(AI_SELECTION_POOL_SIZE, uniqueRanked.length));
  const hydrateIds = aiSelectionPoolMeta.map((item) => item.component._id);

  const hydratedDocs = hydrateIds.length
    ? await Component.find({ _id: { $in: hydrateIds } })
        .select(FULL_COMPONENT_PROJECTION)
        .lean()
    : [];

  const hydratedById = new Map(hydratedDocs.map((doc) => [String(doc._id), doc]));

  const aiSelectionPoolRanked = aiSelectionPoolMeta
    .map((item) => {
      const hydrated = hydratedById.get(String(item.component._id));
      if (!hydrated) {
        return null;
      }
      return {
        component: hydrated,
        score: item.score,
        details: item.details,
      };
    })
    .filter(Boolean);

  const resultCount = aiSelectionPoolRanked.length === 0 ? 0 : Math.min(RESPONSE_RESULT_COUNT, Math.max(3, aiSelectionPoolRanked.length));
  const selected = aiSelectionPoolRanked.slice(0, resultCount);
  const bestRanked = selected[0] || null;
  const alternativeRanked = selectDiverseAlternatives(selected, 4);

  if (process.env.NODE_ENV !== "production") {
    // Debug: Show ranking results and component scores
    const topRanked = ranked.slice(0, 5).map(item => ({
      name: item.component.name,
      score: item.score.toFixed(2),
      intent: item.details.intentMatch,
      semantic: item.details.semanticMatchCount,
      search: item.details.searchTextMatches,
      quality: item.details.qualityScore,
      popularity: item.details.popularity,
      logicPenalty: item.details.logicPenalty || 0,
      componentClass: item.component.componentClass,
    }));
    
    const excludedComponents = candidates
      .filter(c => !candidatesForRanking.some(cr => cr._id?.toString() === c._id?.toString()))
      .slice(0, 3)
      .map(c => c.name);
    
    console.log(
      JSON.stringify({
        prompt,
        extractedIntent: intentInfo,
        keywords,
        totalMatchesAfterPrimaryFilter,
        modifiers,
        finalResultsCount: selected.length,
        aiSelectionPoolSize: aiSelectionPoolRanked.length,
        topRanked,
        bestSelected: bestRanked?.component.name,
        excludedComponents,
      }, null, 2)
    );
  }

  return {
    best: bestRanked ? toResultPayload(bestRanked.component, bestRanked.details, primaryIntent) : null,
    alternatives: alternativeRanked.map(({ component, details }) => toResultPayload(component, details, primaryIntent)),
    aiSelectionPool: aiSelectionPoolRanked.map(({ component, details }) =>
      toAiCandidatePayload(component, details, primaryIntent)
    ),
  };
};

module.exports = {
  retrieveComponents,
};
