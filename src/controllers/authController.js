const User = require("../models/userModel");
const bcrypt = require("bcrypt");

exports.signUp = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 이메일, 비밀번호 입력 확인
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "이메일과 비밀번호를 입력해주세요." });
    }

    // 비밀번호 길이 유효성 검사 (예시: 6자 이상)
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "비밀번호는 최소 6자 이상이어야 합니다." });
    }

    // 이메일 중복 확인
    const existingUser = await User.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "이미 사용 중인 이메일입니다." });
    }

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);

    // 사용자 정보 데이터베이스에 저장
    const newUser = await User.createUser(email, hashedPassword);

    res.status(201).json({ message: "회원가입 성공", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "회원가입 실패", error: error.message });
  }
};
