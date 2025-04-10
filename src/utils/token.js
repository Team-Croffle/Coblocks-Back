require("dotenv").config();

module.exports = {
  generateVerificationCode: () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 100000 ~ 999999 사이의 6자리 숫자 생성
    return code;
  },
};
