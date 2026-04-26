const DANGEROUS_KEY_PATTERN = /^\$|\./;

const sanitizeObject = (value) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }

  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    const safeKey = key.replace(/\$/g, "").replace(/\./g, "");

    if (!safeKey || DANGEROUS_KEY_PATTERN.test(key)) {
      acc[safeKey || "sanitized"] = sanitizeObject(nestedValue);
      return acc;
    }

    acc[safeKey] = sanitizeObject(nestedValue);
    return acc;
  }, {});
};

const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeObject(req.params);
  }

  return next();
};

module.exports = sanitizeInput;
