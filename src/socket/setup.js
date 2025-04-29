// src/socket/setup.js (최종 정리본 - 핸들러 호출)

const logger = require("../utils/logger"); // 로거
const events = require("./events"); // 이벤트 상수
const handlers = require("./handlers"); // 이벤트 핸들러 함수들
const SocketStateManager = require("./SocketStateManager"); // 상태 관리자 클래스

// 모듈 스코프 변수: stateManager 인스턴스를 저장
let stateManagerInstance = null;

/**
 * Socket.IO 서버 인스턴스를 받아 초기 설정을 수행하는 함수
 * @param {object} io - Socket.IO 서버 인스턴스
 */
function initializeSocket(io) {
  // SocketStateManager 인스턴스 생성 (모든 연결이 공유)
  stateManagerInstance = new SocketStateManager();

  // Socket.IO 인증 미들웨어 설정
  io.use((socket, next) => {
    // 클라이언트 연결 시 auth 정보 확인
    const userId = socket.handshake.auth.userId;
    const username = socket.handshake.auth.username;

    if (!userId) {
      logger.warn(
        `[Socket.IO Auth] Connection rejected: Missing userId. Socket ID: ${socket.id}`
      );
      return next(new Error("Authentication failed: Missing userId."));
    }
    // 소켓 객체에 사용자 정보 부착
    socket.userId = userId;
    socket.userName = username || `User_${userId.substring(0, 4)}`;
    logger.info(
      `[Socket.IO Auth] Socket ${socket.id} authenticated. UserID: ${userId}, Username: ${socket.userName}`
    );
    next(); // 통과
  });

  // 'connection' 이벤트 리스너: 새로운 클라이언트 연결 시 실행
  io.on(events.CONNECT, (socket) => {
    // socket: 연결된 개별 클라이언트 소켓 객체
    logger.info(
      `[Socket.IO] User connected: ${socket.id}, UserID: ${socket.userId}`
    );

    // 'disconnect' 이벤트 리스너: 클라이언트 연결 해제 시 실행
    socket.on(events.DISCONNECT, (reason) => {
      // handlers.js에 정의된 handleDisconnect 함수를 호출하여 처리 위임
      // stateManagerInstance 존재 확인 후 전달
      if (stateManagerInstance) {
        handlers.handleDisconnect(socket, stateManagerInstance, io, reason);
      } else {
        logger.error(
          "[Socket.IO] StateManager not initialized when handling DISCONNECT."
        );
      }
    });

    // 'error' 이벤트 리스너: 소켓 오류 발생 시 실행
    socket.on(events.ERROR, (error) => {
      logger.error(
        `[Socket.IO] Socket error from ${socket.id} (${socket.userId}): ${error.message}`
      );
    });

    // 'joinClassroom' 이벤트 리스너: 클라이언트의 강의실 참여 요청 처리
    socket.on(events.JOIN_CLASSROOM, (data) => {
      // handlers.js의 handleJoinClassroom 함수 호출 (의존성 전달)
      // stateManagerInstance 존재 확인 후 전달
      if (stateManagerInstance) {
        handlers.handleJoinClassroom(socket, data, stateManagerInstance, io);
      } else {
        logger.error(
          "[Socket.IO] StateManager not initialized when handling JOIN_CLASSROOM."
        );
        // 오류 처리 필요
      }
    });

    // 'sendMessage' 이벤트 리스너: 클라이언트의 채팅 메시지 전송 요청 처리
    socket.on(events.SEND_MESSAGE, (data) => {
      // handlers.js의 handleSendMessage 함수 호출 (의존성 전달)
      // stateManagerInstance 존재 확인 후 전달
      if (stateManagerInstance) {
        handlers.handleSendMessage(socket, data, stateManagerInstance, io);
      } else {
        logger.error(
          "[Socket.IO] StateManager not initialized when handling SEND_MESSAGE."
        );
        // 오류 처리 필요
      }
    });

    // TODO: 다른 필요한 이벤트 리스너들 추가 (LEAVE_CLASSROOM 등)
  }); // io.on('connection', ...) 끝

  logger.info(
    "[Socket.IO] Server initialized and event listeners set up via setup.js."
  );
}

// StateManager 인스턴스를 가져오는 함수 (외부에서 사용 가능)
const getStateManager = () => {
  if (!stateManagerInstance) {
    logger.error(
      "[StateManager] StateManager instance not available! Was initializeSocket called?"
    );
    return null;
  }
  return stateManagerInstance;
};

// 외부에서 사용할 함수들을 내보냄
module.exports = {
  initializeSocket,
  getStateManager,
};
