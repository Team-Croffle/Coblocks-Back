const logger = require("../utils/logger");

/**
 * 사용자(User) 관련 상태 관리를 담당하는 클래스
 */
class UserManager {
  constructor() {
    this.userRoomMap = {};
  }

  /**
   * 사용자를 특정 강의실에 추가합니다.
   */
  addUserToRoom(socketId, userId, username, classroomId, roomUsers) {
    // 새로운 소켓 정보로 사용자를 users 목록에 추가 (또는 업데이트)
    const userEntry = { userId, username, socketId, joinedAt: new Date() };
    roomUsers[socketId] = userEntry;

    // userRoomMap 업데이트 (새 소켓 ID 기준)
    this.userRoomMap[socketId] = classroomId;

    logger.info(
      `[UserManager] User ${userId}(${username}, ${socketId}) added/updated in room ${classroomId}. Total users: ${
        Object.keys(roomUsers).length
      }`
    );
  }

  /**
   * 동일한 사용자 ID의 이전 소켓 정보를 제거합니다.
   */
  removeOldSocketForUser(userId, socketId, classroomId, roomUsers) {
    let oldSocketId = null;
    for (const existingSocketId in roomUsers) {
      if (roomUsers[existingSocketId].userId === userId) {
        oldSocketId = existingSocketId;
        break;
      }
    }

    if (oldSocketId && oldSocketId !== socketId) {
      logger.warn(
        `[UserManager] User ${userId} already in room ${classroomId} with old socket ${oldSocketId}. Removing old socket state before adding new socket ${socketId}.`
      );
      delete roomUsers[oldSocketId];
      delete this.userRoomMap[oldSocketId];
      return true;
    }
    return false;
  }

  /**
   * 사용자를 강의실에서 제거합니다.
   */
  removeUserFromRoom(socketId, roomId, roomUsers) {
    if (!roomUsers[socketId]) {
      return false;
    }

    const userEntry = roomUsers[socketId];
    const userId = userEntry?.userId;
    const username = userEntry?.username;

    logger.info(
      `[UserManager] Removing user ${userId || "N/A"}(${
        username || "N/A"
      }, ${socketId}) from room ${roomId}.`
    );
    
    delete roomUsers[socketId];
    delete this.userRoomMap[socketId];
    return true;
  }

  /**
   * 소켓 ID로 현재 속한 강의실 ID를 반환합니다.
   */
  getRoomIdBySocketId(socketId) {
    return this.userRoomMap[socketId] || null;
  }

  /**
   * 사용자가 이미 다른 방에 있는지 확인하고 필요시 이전 방에서 제거합니다.
   */
  checkAndHandlePreviousRoom(socketId, targetClassroomId) {
    const previousRoomId = this.userRoomMap[socketId] || null;
    
    if (previousRoomId && previousRoomId !== targetClassroomId) {
      logger.info(
        `[UserManager] User with socket ${socketId} moving from room ${previousRoomId} to ${targetClassroomId}.`
      );
      return previousRoomId;
    }
    
    return null;
  }
}

module.exports = UserManager;