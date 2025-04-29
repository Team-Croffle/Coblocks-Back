// src/socket/SocketStateManager.js (디버깅 로그 포함 최종본)

const logger = require("../utils/logger");

class SocketStateManager {
  constructor() {
    this.rooms = {};
    this.userRoomMap = {};
    this.classroomManagerMap = {};
    logger.info("[StateManager] Initialized.");
  }

  /**
   * 사용자를 특정 강의실 상태에 추가/업데이트합니다. (중복 처리 추가)
   */
  addUser(
    socketId,
    userId,
    username,
    classroomId,
    classroomCode,
    isManager,
    classroomDetails
  ) {
    let previousRoomId = this.userRoomMap[socketId] || null;
    let endedPreviousClassroom = null;

    if (previousRoomId && previousRoomId !== classroomId) {
      logger.info(
        `[StateManager] User ${userId}(${socketId}) moving from room ${previousRoomId} to ${classroomId}. Removing from previous room first.`
      );
      const removeResult = this.removeUser(socketId, previousRoomId);
      if (removeResult.endedClassroomDetails) {
        endedPreviousClassroom = removeResult.endedClassroomDetails;
      }
      previousRoomId = null;
    }

    if (!this.rooms[classroomId]) {
      if (!isManager) {
        if (!this.isClassroomActive(classroomId)) {
          logger.warn(
            `[StateManager] Join denied for non-manager ${userId}(${socketId}) to inactive room ${classroomId}.`
          );
          return {
            success: false,
            message: "Cannot join: Classroom session is not active.",
          };
        }
        logger.error(
          `[StateManager] Inconsistency: Manager exists for ${classroomId} but room state is missing!`
        );
        return { success: false, message: "Server state inconsistency." };
      }
      logger.info(
        `[StateManager] Initializing new room state for ${classroomId} by manager ${userId}(${socketId}).`
      );
      this.rooms[classroomId] = {
        users: {},
        managerSocketId: socketId,
        classroomCode: classroomCode,
        classroomDetails: classroomDetails,
      };
      this.classroomManagerMap[classroomId] = socketId;
    } else {
      if (isManager) {
        logger.info(
          `[StateManager] Manager ${userId}(${socketId}) re-joined room ${classroomId}. Updating manager socket ID.`
        );
        this.rooms[classroomId].managerSocketId = socketId;
        this.classroomManagerMap[classroomId] = socketId;
      }
    }

    const roomUsers = this.rooms[classroomId].users;
    let oldSocketId = null;
    for (const existingSocketId in roomUsers) {
      if (roomUsers[existingSocketId].userId === userId) {
        oldSocketId = existingSocketId;
        break;
      }
    }

    if (oldSocketId && oldSocketId !== socketId) {
      logger.warn(
        `[StateManager] User ${userId} already in room ${classroomId} with old socket ${oldSocketId}. Removing old socket state before adding new socket ${socketId}.`
      );
      delete roomUsers[oldSocketId];
      delete this.userRoomMap[oldSocketId];
    }

    const userEntry = { userId, username, socketId, joinedAt: new Date() };
    roomUsers[socketId] = userEntry;
    this.userRoomMap[socketId] = classroomId;

    logger.info(
      `[StateManager] User ${userId}(${username}, ${socketId}) added/updated in room ${classroomId}. Total users: ${
        Object.keys(roomUsers).length
      }`
    );

    return {
      success: true,
      message: "User added/updated in room state.",
      previousRoomId: null,
      endedPreviousClassroom: endedPreviousClassroom,
    };
  }

  /**
   * 상태에서 사용자를 제거합니다.
   */
  removeUser(socketId, classroomId = null) {
    const roomId = classroomId || this.userRoomMap[socketId];
    if (!roomId || !this.rooms[roomId] || !this.rooms[roomId].users[socketId]) {
      if (this.userRoomMap[socketId]) delete this.userRoomMap[socketId];
      return {
        success: false,
        message: "User not found in active room state.",
      };
    }

    const roomState = this.rooms[roomId];
    const userEntry = roomState.users[socketId];
    const userId = userEntry?.userId;
    const username = userEntry?.username;

    logger.info(
      `[StateManager] Removing user ${userId || "N/A"}(${
        username || "N/A"
      }, ${socketId}) from room ${roomId}.`
    );
    delete roomState.users[socketId];
    delete this.userRoomMap[socketId];

    const wasManager = roomState.managerSocketId === socketId;
    let endedClassroomDetails = null;

    if (wasManager) {
      logger.info(
        `[StateManager] Manager ${
          userId || "N/A"
        }(${socketId}) left/disconnected room ${roomId}. Ending session.`
      );
      endedClassroomDetails = {
        id: roomId,
        code: roomState.classroomCode,
        name: roomState.classroomDetails?.classroom_name || "N/A",
        managerId: userId,
      };
      this.endClassroomSession(roomId); // 방 상태 정리
    }

    const remainingUsers = this.rooms[roomId]
      ? Object.values(this.rooms[roomId].users)
      : [];

    return {
      success: true,
      message: wasManager ? "Manager removed, session ended." : "User removed.",
      roomId: roomId,
      usersInRoom: remainingUsers,
      endedClassroomDetails: endedClassroomDetails,
    };
  }

  /**
   * 특정 강의실의 사용자 목록을 반환합니다. (디버깅 로그 추가)
   */
  getUsersInClassroom(classroomId) {
    // <<<--- 디버깅 로그 포함 버전 ---<<<
    logger.info(
      `>>> [Debug State Check - Inside Func] Checking for classroomId: ${classroomId}`
    );
    const room = this.rooms[classroomId];
    logger.info(
      `>>> [Debug State Check - Inside Func] Found room object:`,
      room
    );
    if (room && room.users) {
      logger.info(
        `>>> [Debug State Check - Inside Func] Found users object:`,
        room.users
      );
      logger.info(
        `>>> [Debug State Check - Inside Func] Type of users object: ${typeof room.users}`
      );
      const usersArray = Object.values(room.users);
      logger.info(
        `>>> [Debug Return Check - Inside Func] Value to return:`,
        usersArray
      );
      logger.info(
        `>>> [Debug Return Check - Inside Func] Array.isArray(value): ${Array.isArray(
          usersArray
        )}`
      );
      return usersArray;
    } else {
      logger.info(
        `>>> [Debug State Check - Inside Func] Room or users not found, returning [].`
      );
      const emptyArray = [];
      logger.info(
        `>>> [Debug Return Check - Inside Func] Value to return:`,
        emptyArray
      );
      logger.info(
        `>>> [Debug Return Check - Inside Func] Array.isArray(value): ${Array.isArray(
          emptyArray
        )}`
      );
      return emptyArray;
    }
  }

  /**
   * 소켓 ID로 현재 속한 강의실 ID를 반환합니다.
   */
  getRoomIdBySocketId(socketId) {
    return this.userRoomMap[socketId] || null;
  }

  /**
   * 강의실 세션이 활성 상태(개설자 접속 중)인지 확인합니다.
   */
  isClassroomActive(classroomId) {
    return !!this.classroomManagerMap[classroomId];
  }

  /**
   * 강의실 세션 상태를 완전히 정리합니다.
   */
  endClassroomSession(classroomId) {
    const room = this.rooms[classroomId];
    if (!room) {
      logger.warn(
        `[StateManager] Attempted to end session for non-existent room ${classroomId}`
      );
      return;
    }
    logger.info(
      `[StateManager] Starting session state cleanup for classroom ${classroomId}.`
    );
    Object.keys(room.users).forEach((sockId) => {
      delete this.userRoomMap[sockId];
    });
    delete this.classroomManagerMap[classroomId];
    delete this.rooms[classroomId];
    logger.info(`State cleanup complete for classroom ${classroomId}.`);
  }
} // class SocketStateManager 끝

module.exports = SocketStateManager;
