const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const {
  sendVerificationEmail,
  resendVerificationEmail,
} = require("../utils/email");
const { generateVerificationCode } = require("../utils/token");

const verificationRequests = new Map(); // 이메일 인증 요청을 저장할 Map
exports.verificationRequests = verificationRequests; // Map을 외부에서 사용할 수 있도록 내보냄

exports.signUp = async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationTokenExpires = Date.now() + 5 * 60 * 1000; // 5분 후 만료

    // 사용자 정보 데이터베이스에 저장
    const newUser = await User.createUser(
      email,
      hashedPassword,
      nickname,
      false // isVerified 기본값 false
    );

    // 임시 인증 요청 정보 저장(서버 메모리)
    verificationRequests.set(email, {
      code: verificationCode,
      expires: verificationTokenExpires,
      uid: newUser.uid,
    });

    await sendVerificationEmail(email, verificationCode);

    res.status(201).json({
      message: "회원가입 성공. 이메일로 발송된 인증 코드를 입력해주세요.",
      user: {
        id: newUser.uid,
        email: newUser.email,
        nickname: newUser.nickname,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "회원가입 실패", error: error.message });
  }
};

exports.resendVerificationEmail = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "이메일 주소를 입력해주세요." });
  }

  try {
    const user = await User.findUserByEmail(email);
    if (!user) {
      return res
        .status(404)
        .json({ message: "해당 이메일로 등록된 사용자를 찾을 수 없습니다." });
    }

    if (user.isVerified) {
      return res
        .status(400)
        .json({ message: "이미 인증된 이메일 주소입니다." });
    }

    const newVerificationCode = await resendVerificationEmail(email);

    // 서버 메모리에 저장된 인증 코드 업데이트
    const requestInfo = verificationRequests.get(email);
    if (requestInfo) {
      requestInfo.code = newVerificationCode;
      requestInfo.expires = Date.now() + 5 * 60 * 1000; // 만료 시간도 갱신
    }

    res.status(200).json({ message: "인증 코드를 이메일로 재발송했습니다." });
  } catch (error) {
    console.error("인증 코드 재발송 오류:", error);
    res.status(500).json({
      message: "인증 코드 재발송에 실패했습니다.",
      error: error.message,
    });
  }
};
