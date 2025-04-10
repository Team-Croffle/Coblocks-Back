require("dotenv").config();
// express-session과 connect-redis 모듈을 사용하여 Redis 세션 미들웨어를 설정
const session = require("express-session");
const { RedisStore } = require("connect-redis");
const { createClient } = require("redis");

// Redis 클라이언트 생성
const redisClient = createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  retry_strategy: (options) => {
    if (options.error && options.error.code === "ECONNREFUSED") {
      return Math.min(options.attempt * 100, 3000); // 재시도 간격 설정
    }
    return Math.min(options.attempt * 100, 3000); // 재시도 간격 설정
  },
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));

// Redis 연결 (async/await 사용)
(async () => {
  try {
    await redisClient.connect();
    console.log("Redis 연결 성공 (세션 미들웨어)");
  } catch (err) {
    console.error("Redis 연결 실패 (세션 미들웨어):", err);
  }
})();

const sessionMiddleware = session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // true로 설정하면 HTTPS에서만 쿠키가 전송됩니다. 배포환경에서는 true로 설정하세요.
    secure: false,
    httpOnly: true,
    sameSite: "strict", // CSRF 공격 방지를 위한 SameSite 설정
    maxAge: 1000 * 60 * 60 * 1,
  },
});

module.exports = sessionMiddleware;
