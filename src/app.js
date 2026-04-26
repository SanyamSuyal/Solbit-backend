const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const routes = require("./routes");
const sanitizeInput = require("./middleware/sanitizeInput");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(sanitizeInput);
app.use(limiter);

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
