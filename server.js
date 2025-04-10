require("dotenv").config();
const express = require("express");
const sessionMiddleware = require("./src/middlewares/sessionMiddleware");
const path = require("path");
const routes = require("./src/routes/index");
const authRoute = require("./src/routes/authRoute");

const app = express();
// 폼 데이터와 JSON 데이터 파싱
// 클라이언트에서 보낸 폼 데이터를 req.body로 접근할 수 있도록 설정
app.use(express.urlencoded({ extended: true }));
// JSON 데이터 파싱
// 파싱된 JSON 데이터를 req.body에 할당
app.use(express.json());
app.use(sessionMiddleware);

// express.static은 정적 파일을 제공하는 미들웨어
app.use(express.static(path.join(__dirname, "public")));

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log("Listening on " + port);
});

app.use("/", routes);
app.use("/auth", authRoute);

// 404 에러 처리 미들웨어
// 모든 라우트가 처리되지 않은 경우에 대한 미들웨어
app.use((req, res, next) => {
  res.status(404).send("Not Found");
});

app.use((err, req, res, next) => {
  // 오류 로깅
  console.error(err.stack);

  // 전역 에러 처리 미들웨어
  res.status(err.status || 500).json({
    error: {
      message: isProduction ? "서버 오류가 발생했습니다." : err.message,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
});

module.exports = app;
