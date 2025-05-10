/Users/isejung/myWork/coblocks/
├── back/ # 백엔드 코드
│ ├── .env
│ ├── package.json
│ ├── README.md
│ ├── server.js # 백엔드 서버 진입점
│ ├── public/ # 정적 파일
│ │ ├── forgot-password.html
│ │ ├── login.html
│ │ ├── main.html
│ │ └── signup.html
│ ├── src/ # 소스 코드
│ │ ├── config/
│ │ ├── controllers/ # 컨트롤러
│ │ │ ├── authController.js
│ │ │ ├── registerController.js
│ │ │ └── verifyEmailController.js
│ │ ├── db/
│ │ ├── middlewares/ # 미들웨어
│ │ │ ├── sessionMiddleware.js
│ │ │ ├── validateForgotPassword.js
│ │ │ ├── validateLogin.js
│ │ │ ├── validateResetCode.js
│ │ │ ├── validateResetPassword.js
│ │ │ └── validateSignup.js
│ │ ├── models/ # 데이터 모델
│ │ │ └── userModel.js
│ │ ├── routes/ # 라우트
│ │ │ ├── index.js
│ │ │ └── authRoute.js
│ │ ├── socket/
│ │ └── utils/ # 유틸리티
│ │ ├── authCode.js
│ │ ├── email.js
│ │ └── token.js
