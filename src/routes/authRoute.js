const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const registerController = require("../controllers/registerController");
const verifyEmailController = require("../controllers/verifyEmailController");
const {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetCode,
  validateResetPassword,
} = require("../middlewares/validate/indexVal");

router.post("/signup", validateSignup, registerController.signUp);
router.post("/login", validateLogin, authController.login);
router.post("/logout", authController.logout);
router.post("/verify-email", verifyEmailController.verifyEmailCode);
router.post(
  "/forgot-password",
  validateForgotPassword,
  authController.forgotPassword
);
router.post(
  "/verify-reset-code",
  validateResetCode,
  authController.verifyResetCode
);
router.post(
  "/reset-password",
  validateResetPassword,
  authController.resetPassword
);
router.post("/resend-reset-code", registerController.resendVerificationEmail);
router.post("/resend-verify-email", registerController.resendVerificationEmail);

module.exports = router;
