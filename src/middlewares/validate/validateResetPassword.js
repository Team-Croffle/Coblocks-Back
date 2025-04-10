// middlewares/validateResetPassword.js
const { body, validationResult } = require("express-validator");

exports.validateResetPassword = [
  body("newPassword")
    .notEmpty()
    .isLength({ min: 8 })
    .withMessage("새 비밀번호는 최소 8자 이상이어야 합니다."),
  body("confirmNewPassword")
    .notEmpty()
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다."),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];
