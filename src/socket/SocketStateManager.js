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

    // 사용자가 이미 다른 방에 접속 중이었다면, 이전 방에서 먼저 제거
    if (previousRoomId && previousRoomId !== classroomId) {
      logger.info(
        `[StateManager] User ${userId}(${socketId}) moving from room ${previousRoomId} to ${classroomId}. Removing from previous room first.`
      );
      const removeResult = this.removeUser(socketId, previousRoomId);
      if (removeResult.endedClassroomDetails) {
        endedPreviousClassroom = removeResult.endedClassroomDetails;
      }
      previousRoomId = null; // 이제 이전 방은 없음
    }

    // 참여하려는 방 상태 초기화 또는 가져오기
    if (!this.rooms[classroomId]) {
      // 방이 없는 경우 새로 생성 (개설자만 가능)
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
        // 만약 개설자는 classroomManagerMap에 있는데 rooms entry가 없다면 상태 불일치 (심각 오류)
        logger.error(
          `[StateManager] Inconsistency: Manager exists for ${classroomId} but room state is missing!`
        );
        return { success: false, message: "Server state inconsistency." };
      }
      // 개설자가 처음 조인하는 경우: 새로운 강의실 세션 초기화
      logger.info(
        `[StateManager] Initializing new room state for ${classroomId} by manager ${userId}(${socketId}).`
      );
      this.rooms[classroomId] = {
        users: {}, // 사용자 목록 초기화
        managerSocketId: socketId, // 개설자 소켓 ID 설정
        classroomCode: classroomCode, // 강의실 코드 저장
        classroomDetails: classroomDetails, // 강의실 상세 정보 객체 저장
      };
      this.classroomManagerMap[classroomId] = socketId; // 활성 세션으로 표시
    } else {
      // 방이 이미 있는 경우
      if (isManager) {
        // 개설자가 재접속한 경우
        logger.info(
          `[StateManager] Manager ${userId}(${socketId}) re-joined room ${classroomId}. Updating manager socket ID.`
        );
        this.rooms[classroomId].managerSocketId = socketId; // 새 소켓 ID로 업데이트
        this.classroomManagerMap[classroomId] = socketId; // 맵도 업데이트
      }
    }

    // 사용자 추가 전, 동일 userId의 기존 소켓 정보 제거 로직
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

    // 새로운 소켓 정보로 사용자를 users 목록에 추가 (또는 업데이트)
    const userEntry = { userId, username, socketId, joinedAt: new Date() };
    roomUsers[socketId] = userEntry;

    // userRoomMap 업데이트 (새 소켓 ID 기준)
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
   * 특정 강의실의 사용자 목록을 반환합니다. (디버깅 로그 제거)
   */
  getUsersInClassroom(classroomId) {
    // <<<--- 디버깅 로그 제거됨 ---<<<
    return this.rooms[classroomId]
      ? Object.values(this.rooms[classroomId].users)
      : [];
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
