const { validateSignup } = require("./validateSignup");
const { validateLogin } = require("./validateLogin");
const { validateForgotPassword } = require("./validateForgotPassword");
const { validateResetCode } = require("./validateResetCode");
const { validateResetPassword } = require("./validateResetPassword");

// authRoute.js에서 사용될 미들웨어를 export함
module.exports = {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetCode,
  validateResetPassword,
};
