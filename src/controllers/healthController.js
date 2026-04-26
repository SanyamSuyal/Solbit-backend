const healthCheck = (req, res) => {
  res.json({ status: "ok" });
};

module.exports = {
  healthCheck,
};
