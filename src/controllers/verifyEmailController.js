const User = require("../models/userModel");
const verificationRequests =
  require("./registerController").verificationRequests;

exports.verifyEmailCode = async (req, res) => {
  const { email, code } = req.body;

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

    const requestInfo = verificationRequests.get(email);
    if (!requestInfo) {
      return res
        .status(404)
        .json({ message: "인증 요청이 없거나 만료되었습니다." });
    }

    if (requestInfo.code !== code) {
      return res
        .status(400)
        .json({ message: "인증 코드가 일치하지 않습니다. 다시 확인해주세요." });
    }

    if (requestInfo.expires < Date.now()) {
      verificationRequests.delete(email); // 만료된 요청 삭제
      return res.status(400).json({
        message:
          "인증 코드가 만료되었습니다. 다시 회원가입하거나 인증 코드를 재발송해주세요.",
      });
    }

    const verifiedUser = await User.verifyUser(requestInfo.uid); // UserId 사용
    if (verifiedUser) {
      verificationRequests.delete(email); // 인증 완료 후 요청 삭제
      return res.status(200).json({
        message: "이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.",
      });
    } else {
      return res
        .status(500)
        .json({ message: "이메일 인증 처리 중 오류가 발생했습니다." });
    }
  } catch (error) {
    console.error("이메일 인증 오류:", error);
    res.status(500).json({
      message: "이메일 인증 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};
