const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// POST /auth/signup - 회원가입 API
router.post("/signup", authController.signUp);

module.exports = router;
