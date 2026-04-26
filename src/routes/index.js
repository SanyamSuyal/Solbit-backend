const express = require("express");
const apiKeyAuth = require("../middleware/apiKeyAuth");
const generateRoutes = require("./generateRoutes");
const componentRoutes = require("./componentRoutes");
const healthRoutes = require("./healthRoutes");

const router = express.Router();

router.use(healthRoutes);
router.use(apiKeyAuth, generateRoutes);
router.use(apiKeyAuth, componentRoutes);

module.exports = router;
