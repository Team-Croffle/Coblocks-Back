// src/socket/setup.js (getIo 함수 추가 - 최종 확인)

const logger = require("../utils/logger"); // 로거
const events = require("./events"); // 이벤트 상수
const handlers = require("./handlers"); // 이벤트 핸들러 함수들
const SocketStateManager = require("./SocketStateManager"); // 상태 관리자 클래스

// 모듈 스코프 변수: 인스턴스 저장
let stateManagerInstance = null;
let ioInstance = null; // <<<--- io 인스턴스 저장 변수

/**
 * Socket.IO 서버 인스턴스를 받아 초기 설정을 수행하는 함수
 * @param {object} io - Socket.IO 서버 인스턴스
 */
function initializeSocket(io) {
  // 인스턴스 생성 및 모듈 스코프 변수에 할당
  stateManagerInstance = new SocketStateManager();
  ioInstance = io; // <<<--- 전달받은 io 인스턴스 할당
  logger.info(
    ">>> [DEBUG Setup] stateManagerInstance assigned:",
    !!stateManagerInstance
  );
  logger.info(">>> [DEBUG Setup] ioInstance assigned:", !!ioInstance);

  // Socket.IO 인증 미들웨어 설정
  io.use((socket, next) => {
    const userId = socket.handshake.auth.userId;
    const username = socket.handshake.auth.username;
    if (!userId) {
      logger.warn(
        `[Socket.IO Auth] Connection rejected: Missing userId. Socket ID: ${socket.id}`
      );
      return next(new Error("Authentication failed: Missing userId."));
    }
    socket.userId = userId;
    socket.userName = username || `User_${userId.substring(0, 4)}`;
    logger.info(
      `[Socket.IO Auth] Socket ${socket.id} authenticated. UserID: ${userId}, Username: ${socket.userName}`
    );
    next(); // 통과
  });

  // 'connection' 이벤트 리스너
  io.on(events.CONNECT, (socket) => {
    logger.info(
      `[Socket.IO] User connected: ${socket.id}, UserID: ${socket.userId}`
    );

    // 'disconnect' 이벤트 리스너
    socket.on(events.DISCONNECT, (reason) => {
      if (stateManagerInstance && ioInstance) {
        handlers.handleDisconnect(
          socket,
          stateManagerInstance,
          ioInstance,
          reason
        );
      } else {
        logger.error(
          "[Socket.IO] StateManager or IO instance not initialized when handling DISCONNECT."
        );
      }
    });

    // 'error' 이벤트 리스너
    socket.on(events.ERROR, (error) => {
      logger.error(
        `[Socket.IO] Socket error from ${socket.id} (${socket.userId}): ${error.message}`
      );
    });

    // 'joinClassroom' 이벤트 리스너
    socket.on(events.JOIN_CLASSROOM, (data) => {
      if (stateManagerInstance && ioInstance) {
        handlers.handleJoinClassroom(
          socket,
          data,
          stateManagerInstance,
          ioInstance
        );
      } else {
        logger.error(
          "[Socket.IO] StateManager or IO instance not initialized when handling JOIN_CLASSROOM."
        );
      }
    });

    // 'sendMessage' 이벤트 리스너
    socket.on(events.SEND_MESSAGE, (data) => {
      if (stateManagerInstance && ioInstance) {
        handlers.handleSendMessage(
          socket,
          data,
          stateManagerInstance,
          ioInstance
        );
      } else {
        logger.error(
          "[Socket.IO] StateManager or IO instance not initialized when handling SEND_MESSAGE."
        );
      }
    });

    // 'leaveClassroom' 이벤트 리스너
    socket.on(events.LEAVE_CLASSROOM, (data) => {
      logger.info(
        `[Socket.IO] Received ${events.LEAVE_CLASSROOM} from ${socket.id} (${socket.userId})`,
        data
      );
      if (stateManagerInstance && ioInstance) {
        handlers.handleLeaveClassroom(
          socket,
          data,
          stateManagerInstance,
          ioInstance
        );
      } else {
        logger.error(
          "[Socket.IO] StateManager or IO instance not initialized when handling LEAVE_CLASSROOM."
        );
      }
    });
  }); // io.on('connection', ...) 끝

  logger.info(
    "[Socket.IO] Server initialized and event listeners set up via setup.js."
  );
}

// StateManager 인스턴스를 가져오는 함수
const getStateManager = () => {
  if (!stateManagerInstance) {
    logger.error("[StateManager] StateManager instance not available!");
    return null;
  }
  return stateManagerInstance;
};

// <<<--- Socket.IO 서버 인스턴스를 가져오는 함수 ---<<<
const getIo = () => {
  if (!ioInstance) {
    logger.error(
      "[Socket.IO] IO instance not available! Was initializeSocket called?"
    );
    return null;
  }
  return ioInstance;
};

// <<<--- module.exports 에 getIo 추가 ---<<<
module.exports = {
  initializeSocket,
  getStateManager,
  getIo, // io 인스턴스를 반환하는 함수 추가
};
