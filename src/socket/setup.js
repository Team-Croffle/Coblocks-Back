/**
 * Socket.IO 설정 및 이벤트 핸들러 등록
 */
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const events = require("./events");
const handlers = require("./handlers/index");
const StateManager = require("./state-manager");

/**
 * Socket.IO 서버를 설정하고 이벤트 핸들러를 등록합니다.
 * @param {Object} server - HTTP 서버 객체
 * @param {Object} options - 설정 옵션
 * @returns {Object} Socket.IO 서버 인스턴스
 */
function setupSocketIO(server, options = {}) {
  // Socket.IO 서버 생성
  const io = socketIO(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    // 추가 옵션 설정
    ...options,
  });

  // 상태 관리자 인스턴스 생성
  const stateManager = new StateManager();

  // 인증 미들웨어 설정
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        logger.warn(`[Socket] No token provided for socket ${socket.id}`);
        return next(new Error("Authentication error: Token required"));
      }

      // JWT 토큰 검증
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded || !decoded.userId) {
        logger.warn(`[Socket] Invalid token for socket ${socket.id}`);
        return next(new Error("Authentication error: Invalid token"));
      }

      // 소켓 객체에 사용자 정보 저장
      socket.userId = decoded.userId;
      socket.userName = decoded.username || "Anonymous";
      logger.info(`[Socket] User ${decoded.userId} authenticated for socket ${socket.id}`);
      next();
    } catch (error) {
      logger.error(`[Socket] Authentication error: ${error.message}`);
      next(new Error("Authentication error"));
    }
  });

  // 연결 이벤트 처리
  io.on("connection", (socket) => {
    logger.info(`[Socket] New connection: ${socket.id}, User: ${socket.userId}`);

    // 강의실 참여 이벤트
    socket.on(events.JOIN_CLASSROOM, (data) => {
      handlers.handleJoinClassroom(socket, data, stateManager, io);
    });

    // 강의실 퇴장 이벤트
    socket.on(events.LEAVE_CLASSROOM, (data) => {
      handlers.handleLeaveClassroom(socket, data, stateManager, io);
    });

    // 메시지 전송 이벤트
    socket.on(events.SEND_MESSAGE, (data) => {
      handlers.handleSendMessage(socket, data, stateManager, io);
    });

    // 참가자 목록 갱신 이벤트
    socket.on(events.REFRESH_PARTICIPANT_LIST, (ackCallback) => {
      handlers.handleRefreshParticipantList(socket, stateManager, ackCallback);
    });

    // 에디터 내용 변경 이벤트
    socket.on(events.EDITOR_CONTENT_CHANGE, (data) => {
      handlers.handleEditorContentChange(socket, data, stateManager, io);
    });

    // 문제 세트 선택 이벤트
    socket.on(events.SELECT_PROBLEM_SET, (data) => {
      handlers.handleSelectProblemSet(socket, data, stateManager, io);
    });

    // 활동 시작 이벤트
    socket.on(events.START_ACTIVITY, () => {
      handlers.handleStartActivity(socket, stateManager, io);
    });

    // 솔루션 제출 이벤트
    socket.on(events.SUBMIT_SOLUTION, (data) => {
      handlers.handleSubmitSolution(socket, data, stateManager, io);
    });

    // 최종 제출 요청 이벤트
    socket.on(events.REQUEST_FINAL_SUBMISSION, (data) => {
      handlers.handleRequestFinalSubmission(socket, data, stateManager, io);
    });

    // 연결 해제 이벤트
    socket.on("disconnect", (reason) => {
      handlers.handleDisconnect(socket, stateManager, io, reason);
    });
  });

  return io;
}

module.exports = setupSocketIO;