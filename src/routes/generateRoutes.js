const express = require("express");
const { generateComponents } = require("../controllers/generateController");
const validateGenerateRequest = require("../middleware/validateGenerateRequest");

const router = express.Router();

router.post("/generate", validateGenerateRequest, generateComponents);
router.post("/api/v1/search", validateGenerateRequest, generateComponents);

module.exports = router;
