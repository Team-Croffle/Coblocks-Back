require("dotenv").config();

const express = require("express"); // Express 프레임워크
const http = require("http"); // Node.js 기본 HTTP 모듈 (나중에 Socket.IO 위해 필요)
const cors = require("cors"); // CORS 미들웨어 (다른 도메인에서의 요청 허용 위해)
const bodyParser = require("body-parser"); // 요청 본문(body) 파싱 미들웨어
const path = require("path"); // 파일 및 디렉토리 경로 작업을 위한 모듈
const { Server } = require("socket.io"); // Socket.IO 서버 생성 위해 필요

const {initializeSocket} = require("./src/socket/setup"); // setup.js에서 함수 가져오기
const logger = require("./src/utils/logger"); // 로거 사용 (이전에 없었다면 추가)

const classroomRouter = require("./src/routes/classroom");

const app = express(); // Express 애플리케이션 생성
const server = http.createServer(app); // Express 앱으로 HTTP 서버 생성

// Socket.IO 서버 인스턴스 생성
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const clientUrl = process.env.CLIENT_URL || "http://localhost:5173"; // 클라이언트 URL (환경변수에서 가져오거나 기본값 설정)

const corsOptions = {
  origin: clientUrl, // 여기서 clientUrl이 실제 요청을 보내는 프론트엔드 주소여야 함
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true, // Supabase Auth JWT 사용 시 Authorization 헤더를 주고받으므로 true가 필요할 수 있음
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send(
    "Backend server is running. Access frontend test page at /socketTest.html or /test."
  );
});

app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "socketTest.html"));
});

app.use("/api", classroomRouter);

initializeSocket(io); // Socket.IO 초기화

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  // 서버가 시작되면 콘솔에 로그 출력 (나중에 logger로 바꿀 수 있음)
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(
    `Access frontend test page at http://localhost:${PORT}/socketTest.html or http://localhost:${PORT}/test`
  );
});

// --- 나중에 에러 처리 미들웨어 등을 추가할 수 있습니다 ---
