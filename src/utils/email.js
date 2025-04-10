const nodemailer = require("nodemailer");
const { encode } = require("html-entities");
const { generateVerificationCode } = require("../utils/token");

// 환경 변수 검증 (SMTP 관련 정보 검증)
if (
  !process.env.SMTP_HOST ||
  !process.env.SMTP_PORT ||
  !process.env.SMTP_USER ||
  !process.env.SMTP_PASS ||
  !process.env.EMAIL_FROM
) {
  throw new Error("SMTP 관련 환경 변수가 설정되지 않았습니다.");
}

// 이메일 발송 설정 (service 옵션 제거)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "false", // 문자열 'true'를 boolean으로 변환
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

module.exports = {
  sendVerificationEmail: async (to, code, subject) => {
    const escapedCode = encode(code); // HTML 인젝션 방지
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: to,
      subject: "회원가입 이메일 인증 코드",
      html: `
          <p>안녕하세요,</p>
          <p>저희 웹사이트에 가입해주셔서 감사합니다.</p>
          <p>아래의 인증 코드를 입력하여 이메일 주소를 인증해주세요.</p>
          <h2>인증 코드: ${escapedCode}</h2>
          <p>본인이 요청하지 않은 경우 이 이메일을 무시해주세요.</p>
          <p>감사합니다.</p>
        `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("Verification email sent to", to);
    } catch (error) {
      console.error("Error sending email:", error.message); // 민감한 정보 제외
      throw new Error(
        "이메일 발송 중 문제가 발생했습니다. 나중에 다시 시도해주세요."
      );
    }
  },

  resendVerificationEmail: async (to) => {
    const newVerificationCode = generateVerificationCode(); // 새로운 인증 코드 생성 (utils/token.js에서)
    const escapedCode = encode(newVerificationCode); // HTML 인젝션 방지
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: to,
      subject: "회원가입 이메일 인증 코드 재발송", // 제목 변경
      html: `
          <p>안녕하세요,</p>
          <p>요청하신 회원가입 이메일 인증 코드를 다시 보내드립니다.</p>
          <p>아래의 인증 코드를 입력하여 이메일 주소를 인증해주세요.</p>
          <h2>새 인증 코드: ${escapedCode}</h2>
          <p>본인이 요청하지 않은 경우 이 이메일을 무시해주세요.</p>
          <p>감사합니다.</p>
        `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("Verification email resent to", to);
      return newVerificationCode; // 새로운 인증 코드를 반환하여 컨트롤러에서 업데이트할 수 있도록 함
    } catch (error) {
      console.error("Error resending verification email:", error.message);
      throw new Error(
        "인증 이메일 재발송 중 문제가 발생했습니다. 나중에 다시 시도해주세요."
      );
    }
  },
};
