/**
 * 소켓 핸들러에서 사용하는 공통 검증 함수
 */
const logger = require("../../utils/logger");
const events = require("../events");

/**
 * 사용자가 유효한 방에 있는지 확인합니다.
 * @param {Object} socket - 소켓 객체
 * @param {Object} stateManager - 상태 관리자 객체
 * @returns {Object} 검증 결과 (success, roomId, room, message)
 */
function validateRoom(socket, stateManager) {
  const socketId = socket.id;
  const userId = socket.userId;
  
  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    return { 
      success: false, 
      message: "You are not currently in a classroom." 
    };
  }
  
  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);
  
  if (!room) {
    logger.warn(`[Validation] Room ${roomId} not found for user ${userId}(${socketId}).`);
    return { 
      success: false, 
      message: "Classroom session not found." 
    };
  }
  
  return {
    success: true,
    roomId,
    room
  };
}

/**
 * 사용자가 방의 관리자인지 확인합니다.
 * @param {Object} socket - 소켓 객체
 * @param {Object} room - 방 객체
 * @returns {Object} 검증 결과 (success, message)
 */
function validateManager(socket, room) {
  const socketId = socket.id;
  const userId = socket.userId;
  
  if (room.managerSocketId !== socketId) {
    logger.warn(`[Validation] User ${userId}(${socketId}) is not the manager of room ${room.id}.`);
    return { 
      success: false, 
      message: "Only the manager can perform this action." 
    };
  }
  
  return { success: true };
}

module.exports = {
  validateRoom,
  validateManager
};