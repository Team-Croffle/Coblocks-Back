const { body, validationResult } = require("express-validator");
const User = require("../../models/userModel");

exports.validateSignup = [
  body("email")
    .notEmpty()
    .isEmail()
    .withMessage("유효한 이메일 주소를 입력해주세요.")
    .custom(async (email) => {
      const existingUser = await User.findUserByEmail(email);
      if (existingUser) {
        throw new Error("이미 사용 중인 이메일입니다.");
      }
      return true;
    }),
  body("password")
    .notEmpty()
    .isLength({ min: 8 })
    .withMessage("비밀번호는 최소 8자 이상이어야 합니다."),
  body("nickname")
    .notEmpty()
    .withMessage("닉네임을 입력해주세요.")
    .isLength({ min: 2, max: 20 })
    .withMessage("닉네임은 2자 이상 20자 이하이어야 합니다."),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];
