const { body, validationResult } = require("express-validator");
const User = require("../../models/userModel");

exports.validateForgotPassword = [
  body("email")
    .notEmpty()
    .isEmail()
    .withMessage("유효한 이메일 주소를 입력해주세요.")
    .custom(async (email) => {
      const user = await User.findUserByEmail(email);
      if (!user) {
        throw new Error("해당 이메일로 등록된 사용자를 찾을 수 없습니다.");
      }
      return true;
    }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];
