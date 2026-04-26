const notFoundHandler = (req, res) => {
  res.status(404).json({ error: "Route not found" });
};

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message;

  return res.status(statusCode).json({ error: message });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
