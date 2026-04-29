const express = require("express");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Backend assessment service is running",
  });
});

module.exports = { healthRouter: router };
