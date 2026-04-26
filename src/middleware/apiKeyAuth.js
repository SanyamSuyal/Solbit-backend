const config = require("../config");

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
};

const apiKeyAuth = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token || !config.apiKeys.includes(token)) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  return next();
};

module.exports = apiKeyAuth;
