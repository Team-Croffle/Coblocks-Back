const { body, validationResult } = require("express-validator");

exports.validateLogin = [
  body("email")
    .notEmpty()
    .isEmail()
    .withMessage("유효한 이메일 주소를 입력해주세요."),
  body("password")
    .notEmpty()
    .withMessage("비밀번호를 입력해주세요.")
    .isLength({ min: 8 })
    .withMessage("비밀번호는 최소 8자 이상이어야 합니다."),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];
