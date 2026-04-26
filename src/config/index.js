const dotenv = require("dotenv");

dotenv.config();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: parsePositiveInt(process.env.PORT, 3000),
  mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/solbit",
  mongodbDbName: process.env.MONGODB_DB_NAME || "solbit",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  groqTimeoutMs: parsePositiveInt(process.env.GROQ_TIMEOUT_MS, 6000),
  apiKeys: (process.env.API_KEYS || "sk-test-123,sk-test-456")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean),
  rateLimitWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
  rateLimitMax: parsePositiveInt(process.env.RATE_LIMIT_MAX, 120),
};
