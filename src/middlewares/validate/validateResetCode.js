const { body, validationResult } = require("express-validator");
const authCodeService = require("../../utils/authCode");

exports.validateResetCode = [
  body("email")
    .notEmpty()
    .isEmail()
    .withMessage("유효한 이메일 주소를 입력해주세요."),
  body("code")
    .notEmpty()
    .withMessage("인증 코드를 입력해주세요.")
    .custom((code, { req }) => {
      const userId = authCodeService.verifyAuthCode(
        req.body.email,
        code,
        "password_reset"
      );
      if (!userId) {
        throw new Error("인증 코드가 유효하지 않습니다.");
      }

      req.resetPasswordUserId = userId;
      return true; // 인증 성공 시 명시적으로 true 반환
    }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];
