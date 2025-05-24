/**
 * 메시지 관련 소켓 이벤트 핸들러
 */
const logger = require("../../utils/logger");
const events = require("../events");

/**
 * 클라이언트의 채팅 메시지 전송 요청(sendMessage 이벤트)을 처리합니다.
 */
function handleSendMessage(socket, data, stateManager, io) {
  try {
    const message = data?.message?.trim();
    const socketId = socket.id;
    const userId = socket.userId;
    const username = socket.userName;

    if (!message) {
      return; // 빈 메시지 무시
    }
    
    if (!userId || !username) {
      logger.error(`[Handler] Missing auth info on socket ${socketId} trying to send message.`);
      socket.emit(events.MESSAGE_ERROR, { message: "Authentication error." });
      return;
    }

    const roomId = stateManager.getRoomIdBySocketId(socketId);

    if (!roomId) {
      logger.warn(`[Handler] User ${userId}(${socketId}) tried to send message but not in a room.`);
      socket.emit(events.MESSAGE_ERROR, { message: "You are not currently in a classroom." });
      return;
    }

    const messageData = {
      userId: userId,
      username: username,
      message: message,
      timestamp: new Date().toISOString(),
    };

    io.to(roomId).emit(events.CLASSROOM_MESSAGE, messageData);
  } catch (error) {
    logger.error(`[Handler] Error in handleSendMessage for socket ${socket?.id}: ${error.message}`, error);
    if (socket) {
      socket.emit(events.ERROR, { message: "An error occurred while sending the message." });
    }
  }
}

module.exports = {
  handleSendMessage
};