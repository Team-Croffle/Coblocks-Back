const logger = require("../utils/logger");
const events = require("./events");
const handlers = require("./handlers/index");
const SocketStateManager = require("./SocketStateManager");
const jwt = require("jsonwebtoken");

let stateManagerInstance = null;
let ioInstance = null;

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
if (!SUPABASE_JWT_SECRET) {
  logger.error("FATAL ERROR: SUPABASE_JWT_SECRET is not defined in .env file.");
  throw new Error("Supabase JWT Secret is required for socket authentication.");
}

/**
 * Socket.IO 서버 인스턴스를 받아 초기 설정을 수행하는 함수
 */
function initializeSocket(io) {
  stateManagerInstance = new SocketStateManager();
  ioInstance = io;
  logger.info(
    ">>> [DEBUG Setup] stateManagerInstance assigned:",
    !!stateManagerInstance
  );
  logger.info(">>> [DEBUG Setup] ioInstance assigned:", !!ioInstance);

  // Socket.IO 인증 미들웨어 설정
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      logger.warn(
        `[Socket Auth] Connection rejected: Missing token. Socket ID: ${socket.id}`
      );
      return next(new Error("Authentication failed: Missing token."));
    }

    // JWT 토큰 검증
    jwt.verify(token, SUPABASE_JWT_SECRET, (err, decoded) => {
      if (err) {
        logger.warn(`[Socket Auth] Token verification failed: ${err.message}`, {
          socketId: socket.id,
        });
        return next(new Error("Authentication failed: Invalid token."));
      }
      const decodedData = decoded.user_metadata;

      // 토큰 검증 성공: 디코딩된 정보에서 사용자 ID(sub) 등을 추출하여 소켓 객체에 저장
      socket.userId = decodedData.sub;
      socket.userName = decodedData.nickname;

      logger.info(
        `[Socket Auth] Socket ${socket.id} authenticated. UserID: ${socket.userId}, Username: ${socket.userName}`
      );
      next(); // 인증 성공, 연결 진행
    });
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
          "[Socket.IO] instance not initialized when handling DISCONNECT."
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
          "[Socket.IO] instance not initialized when handling JOIN_CLASSROOM."
        );
      }
    });

    // 'refreshParticipantList' 이벤트 리스너
    socket.on(events.REFRESH_PARTICIPANT_LIST, (ackCallback) => {
      if (stateManagerInstance) {
        handlers.handleRefreshParticipantList(
          socket,
          stateManagerInstance,
          ackCallback
        );
      } else {
        logger.error(
          "[Socket.IO] instance not initialized when handling REFRESH_PARTICIPANT_LIST."
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
          "[Socket.IO] instance not initialized when handling SEND_MESSAGE."
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
          "[Socket.IO] instance not initialized when handling LEAVE_CLASSROOM."
        );
      }
    });

    // 'editorContentChange' 이벤트 리스너
    socket.on(events.EDITOR_CONTENT_CHANGE, (data) => {
      logger.info(
        `[Socket.IO] Received ${events.EDITOR_CONTENT_CHANGE} from ${socket.id} (${socket.userId})`
      );

      if (stateManagerInstance && ioInstance) {
        handlers.handleEditorContentChange(
          socket,
          data,
          stateManagerInstance,
          ioInstance
        );
      } else {
        logger.error(
          "[Socket.IO] instance not initialized when handling EDITOR_CONTENT_CHANGE."
        );

        socket.emit(events.ERROR, {
          message: "Server not ready to handle editor change",
        });
      }
    });

    socket.on(events.SELECT_PROBLEM_SET, (data) => {
      logger.info(
        `[Socket.IO] Recevied ${events.SELECT_PROBLEM_SET} from ${socket.id} (${socket.userId})`
      );
      // data는 { quest_id: UUID } 형태로 들어옴
      if (stateManagerInstance && ioInstance) {
        handlers.handleSelectProblemSet(
          socket,
          data,
          stateManagerInstance,
          ioInstance
        );
      } else {
        logger.error(
          "[Socket.IO] instance not initialized when handling SELECT_PROBLEM_SET."
        );
      }
    });

    socket.on(events.START_ACTIVITY, () => {
      logger.info(
        `[Socket.IO] Received ${events.START_ACTIVITY} from ${socket.id} (${socket.userId})`
      );
      if (stateManagerInstance && ioInstance) {
        handlers.handleStartActivity(socket, stateManagerInstance, ioInstance);
      } else {
        logger.error(
          "[Socket.IO] Instance not initialized when handling START_ACTIVITY."
        );
        socket.emit(events.ERROR, { message: "Server not ready." });
      }
    });

    socket.on(events.SUBMIT_SOLUTION, (data) => {
      logger.info(
        `[Socket.IO] Received ${events.SUBMIT_SOLUTION} from ${socket.id} (${socket.userId})`
      );
      if (stateManagerInstance && ioInstance) {
        handlers.handleSubmitSolution(
          socket,
          data,
          stateManagerInstance,
          ioInstance
        );
      } else {
        logger.error(
          "[Socket.IO] Instance not initialized when handling SUBMIT_SOLUTION."
        );
        socket.emit(events.ERROR, { message: "Server not ready." });
      }
    });

    socket.on(events.REQUEST_FINAL_SUBMISSION, (data) => {
      logger.info(
        `[Socket.IO] Received ${events.REQUEST_FINAL_SUBMISSION} from ${socket.id} (${socket.userId})`
      );
      if (stateManagerInstance && ioInstance) {
        handlers.handleRequestFinalSubmission(
          socket,
          data,
          stateManagerInstance,
          ioInstance
        );
      } else {
        logger.error(
          "[Socket.IO] Instance not initialized when handling REQUEST_FINAL_SUBMISSION."
        );
        socket.emit(events.ERROR, { message: "Server not ready." });
      }
    });

    socket.on(events.REQUEST_END_ACTIVITY, () => {
      logger.info(
        `[Socket.IO] Received ${events.REQUEST_END_ACTIVITY} from ${socket.id} (${socket.userId})`
      );
      if (stateManagerInstance && ioInstance) {
        handlers.handleEndActivity(socket, stateManagerInstance, ioInstance);
      } else {
        logger.error(
          "[Socket.IO] Instance not initialized when handling REQUEST_END_ACTIVITY."
        );
        socket.emit(events.ERROR, { message: "Server not ready." });
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
