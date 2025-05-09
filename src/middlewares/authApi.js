const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

// .env 파일에서 Supabase JWT Secret Key 가져오기
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!SUPABASE_JWT_SECRET) {
  // 중요: JWT Secret이 없으면 서버가 시작되지 않도록 하거나, 경고를 명확히 해야 합니다.
  // 여기서는 일단 에러를 던져서 서버 시작을 막도록 합니다.
  logger.error("FATAL ERROR: SUPABASE_JWT_SECRET is not defined in .env file.");
  throw new Error("Supabase JWT Secret is required for authentication.");
}

/**
 * API 요청을 위한 JWT 인증 미들웨어
 * - Authorization 헤더에서 Bearer 토큰을 추출하고 검증합니다.
 * - 유효한 토큰이면 req.user 객체에 사용자 정보를 추가합니다.
 * - 유효하지 않으면 401 또는 403 오류를 반환합니다.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  // 헤더 형식: "Bearer TOKEN_STRING"
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    logger.warn("[AuthAPI] No token provided with request.");
    return res
      .status(401)
      .json({ success: false, message: "Authentication token required." }); // Unauthorized
  }

  // 토큰 검증
  jwt.verify(token, SUPABASE_JWT_SECRET, (err, decoded) => {
    if (err) {
      logger.warn(`[AuthAPI] Token verification failed: ${err.message}`, {
        token,
      });
      // err.name === 'TokenExpiredError' 등으로 만료 여부 확인 가능
      return res
        .status(403)
        .json({ success: false, message: "Invalid or expired token." }); // Forbidden
    }

    // 토큰이 유효하면, 디코딩된 페이로드(payload)에서 사용자 정보를 추출
    // Supabase JWT의 'sub' 클레임은 사용자의 고유 ID(UUID)입니다.
    // 필요에 따라 'email', 'role' 등 다른 정보도 포함될 수 있습니다.
    req.user = {
      id: decoded.sub, // Supabase 사용자 ID
      email: decoded.email, // 예시
      role: decoded.role, // 예시 (Supabase JWT 역할)
      // 필요한 다른 정보들을 decoded 객체에서 가져와 req.user에 추가 가능
    };

    logger.info(
      `[AuthAPI] User ${req.user.id} authenticated for API request to ${req.originalUrl}`
    );
    next(); // 다음 미들웨어 또는 라우트 핸들러로 제어 전달
  });
};

module.exports = authenticateToken;
