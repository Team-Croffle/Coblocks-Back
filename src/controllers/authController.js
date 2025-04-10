const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const authCodeService = require("../utils/authCode");

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findUserByEmail(email);

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
    }

    if (!user.isVerified) {
      return res
        .status(400)
        .json({ message: "이메일 인증이 완료되지 않았습니다." });
    }

    // 로그인 성공 시 세션에 사용자 정보 저장
    req.session.userId = user.uid;
    req.session.email = user.email;
    req.session.nickname = user.nickname;
    req.session.isLoggedIn = true;

    res.status(200).json({
      message: "로그인 성공",
      user: { id: user.uid, email: user.email, nickname: user.nickname },
    });
  } catch (error) {
    console.error("로그인 오류:", error);
    res.status(500).json({ message: "로그인 처리 중 오류가 발생했습니다." });
  }
};

exports.logout = async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("로그아웃 오류:", err);
      return res.status(500).json({ message: "로그아웃 실패" });
    }
    res.clearCookie("connect.sid"); // connect.sid는 기본 세션 쿠키 이름입니다.
    res.status(204).send(); // No Content - 성공적으로 로그아웃됨
  });
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findUserByEmail(email);
    if (!user) {
      return res
        .status(404)
        .json({ message: "해당 이메일로 등록된 사용자를 찾을 수 없습니다." });
    }

    const success = await authCodeService.generateAndSaveAuthCode(
      email,
      user.uid,
      "password_reset"
    );
    if (success) {
      res.status(200).json({
        message: "비밀번호 재설정 인증 코드를 이메일로 발송했습니다.",
      });
    } else {
      res.status(500).json({ message: "인증 코드 발송에 실패했습니다." });
    }
  } catch (error) {
    console.error("비밀번호 찾기 오류:", error);
    res
      .status(500)
      .json({ message: "비밀번호 찾기 처리 중 오류가 발생했습니다." });
  }
};

exports.verifyResetCode = async (req, res) => {
  // 미들웨어에서 이미 검증한 userId 사용
  const userId = req.resetPasswordUserId;

  // 인증 성공 시 세션에 사용자 ID 저장
  req.session.resetPasswordUserId = userId;

  return res.status(200).json({
    message: "인증 코드가 확인되었습니다. 새 비밀번호를 설정해주세요.",
  });
};

exports.resetPassword = async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.session.resetPasswordUserId; // 세션에서 사용자 ID 가져오기

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updatePassword(userId, hashedPassword);

    // 비밀번호 재설정 완료 후 세션 정보 삭제 (선택 사항)
    delete req.session.resetPasswordUserId;

    res
      .status(200)
      .json({ message: "비밀번호가 성공적으로 재설정되었습니다." });
  } catch (error) {
    console.error("비밀번호 재설정 오류:", error);
    res
      .status(500)
      .json({ message: "비밀번호 재설정 처리 중 오류가 발생했습니다." });
  }
};

exports.resendResetCode = async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ message: "이메일 주소를 입력해주세요." });

  try {
    const user = await User.findUserByEmail(email);
    if (!user)
      return res
        .status(404)
        .json({ message: "해당 이메일로 등록된 사용자를 찾을 수 없습니다." });

    const success = await authCodeService.resendAuthCode(
      email,
      user.uid,
      "password_reset"
    );
    if (success) {
      res.status(200).json({
        message: "비밀번호 재설정 인증 코드를 이메일로 재발송했습니다.",
      });
    } else {
      res.status(500).json({ message: "인증 코드 재발송에 실패했습니다." });
    }
  } catch (error) {
    console.error("비밀번호 재설정 코드 재전송 오류:", error);
    res.status(500).json({ message: "인증 코드 재발송에 실패했습니다." });
  }
};
