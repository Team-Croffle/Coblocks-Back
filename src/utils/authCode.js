const { generateVerificationCode } = require("../utils/token");
const { sendVerificationEmail } = require("../utils/email");

const authCodeRequests = new Map();

exports.generateAndSaveAuthCode = async (
  email,
  userId,
  purpose = "email_verification",
  expiryInMinutes = 5
) => {
  const code = generateVerificationCode();
  const expiresAt = Date.now() + expiryInMinutes * 60 * 1000;

  authCodeRequests.set(email, { code, expiresAt, userId, purpose });

  await sendVerificationEmail(
    email,
    code,
    purpose === "email_verification"
      ? "이메일 인증 코드"
      : "비밀번호 재설정 인증 코드"
  );

  return true;
};

exports.verifyAuthCode = (email, code, purpose) => {
  const requestInfo = authCodeRequests.get(email);

  if (!requestInfo) {
    return null;
  }

  if (requestInfo.code !== code) {
    return null;
  }

  if (requestInfo.expiresAt <= Date.now()) {
    return null;
  }

  if (requestInfo.purpose !== purpose) {
    return null;
  }

  const userId = requestInfo.userId;
  authCodeRequests.delete(email);
  return userId;
};

exports.resendAuthCode = async (
  email,
  purpose = "email_verification",
  expiryInMinutes = 5
) => {
  const code = generateVerificationCode();
  const expiresAt = Date.now() + expiryInMinutes * 60 * 1000;
  const requestInfo = authCodeRequests.get(email);

  if (requestInfo) {
    requestInfo.code = code;
    requestInfo.expiresAt = expiresAt;
  } else {
    const user = await User.findUserByEmail(email);
    if (!user) return false;
    authCodeRequests.set(email, { code, expiresAt, userId: user.id, purpose });
  }

  await sendVerificationEmail(
    email,
    code,
    purpose === "email_verification"
      ? "이메일 인증 코드 재전송"
      : "비밀번호 재설정 인증 코드 재전송"
  );
  return true;
};
