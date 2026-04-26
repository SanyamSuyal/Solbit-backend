const express = require("express");
const { getComponentById } = require("../controllers/componentController");

const router = express.Router();

router.get("/component/:id", getComponentById);

module.exports = router;
