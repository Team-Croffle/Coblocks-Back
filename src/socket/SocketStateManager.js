const logger = require("../utils/logger");
const RoomManager = require("./RoomManager");
const UserManager = require("./UserManager");

/**
 * 소켓 연결 상태 및 강의실 세션을 관리하는 클래스
 */
class SocketStateManager {
  constructor() {
    this.roomManager = new RoomManager();
    this.userManager = new UserManager();
    logger.info("[StateManager] Initialized.");
  }

  /**
   * 사용자를 특정 강의실 상태에 추가/업데이트합니다.
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
    let endedPreviousClassroom = null;

    // 사용자가 이미 다른 방에 접속 중이었다면, 이전 방에서 먼저 제거
    const previousRoomId = this.userManager.checkAndHandlePreviousRoom(socketId, classroomId);
    if (previousRoomId) {
      const removeResult = this.removeUser(socketId, previousRoomId);
      if (removeResult.endedClassroomDetails) {
        endedPreviousClassroom = removeResult.endedClassroomDetails;
      }
    }

    // 참여하려는 방 상태 초기화 또는 가져오기
    const room = this.roomManager.getRoom(classroomId);
    
    if (!room) {
      // 방이 없는 경우 새로 생성 (개설자만 가능)
      if (!isManager) {
        if (!this.roomManager.isClassroomActive(classroomId)) {
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
      this.roomManager.initializeRoom(classroomId, socketId, classroomCode, classroomDetails);
    } else if (isManager) {
      // 방이 이미 있고 개설자가 재접속한 경우
      logger.info(
        `[StateManager] Manager ${userId}(${socketId}) re-joined room ${classroomId}. Updating manager socket ID.`
      );
      this.roomManager.updateManagerSocketId(classroomId, socketId);
    } else {
      // 일반 사용자가 참여하는 경우, 최대 인원 제한 확인
      if (!this.roomManager.canJoinRoom(classroomId)) {
        logger.warn(
          `[StateManager] Join denied for user ${userId}(${socketId}) to room ${classroomId}: Maximum capacity (4) reached.`
        );
        return {
          success: false,
          message: "Cannot join: Classroom has reached maximum capacity of 4 users.",
        };
      }
    }

    const roomUsers = this.roomManager.getRoom(classroomId).users;
    
    // 사용자 추가 전, 동일 userId의 기존 소켓 정보 제거
    this.userManager.removeOldSocketForUser(userId, socketId, classroomId, roomUsers);

    // 사용자를 강의실에 추가
    this.userManager.addUserToRoom(socketId, userId, username, classroomId, roomUsers);

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
    const roomId = classroomId || this.userManager.getRoomIdBySocketId(socketId);
    if (!roomId) {
      return {
        success: false,
        message: "User not found in active room state.",
      };
    }

    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      if (this.userManager.getRoomIdBySocketId(socketId)) {
        delete this.userManager.userRoomMap[socketId];
      }
      return {
        success: false,
        message: "User not found in active room state.",
      };
    }

    const userEntry = room.users[socketId];
    if (!userEntry) {
      return {
        success: false,
        message: "User not found in active room state.",
      };
    }

    const userId = userEntry.userId;
    const username = userEntry.username;
    
    // 사용자를 강의실에서 제거
    this.userManager.removeUserFromRoom(socketId, roomId, room.users);

    // 개설자인지 확인
    const wasManager = room.managerSocketId === socketId;
    let endedClassroomDetails = null;

    if (wasManager) {
      logger.info(
        `[StateManager] Manager ${
          userId || "N/A"
        }(${socketId}) left/disconnected room ${roomId}. Ending session.`
      );
      endedClassroomDetails = {
        id: roomId,
        code: room.classroomCode,
        name: room.classroomDetails?.classroom_name || "N/A",
        managerId: userId,
      };
      this.roomManager.endClassroomSession(roomId, this.userManager.userRoomMap);
    }

    const remainingUsers = this.roomManager.getRoom(roomId)
      ? Object.values(this.roomManager.getRoom(roomId).users)
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
   * 특정 강의실의 사용자 목록을 반환합니다.
   */
  getUsersInClassroom(classroomId) {
    const room = this.roomManager.getRoom(classroomId);
    return room ? Object.values(room.users) : [];
  }

  /**
   * 소켓 ID로 현재 속한 강의실 ID를 반환합니다.
   */
  getRoomIdBySocketId(socketId) {
    return this.userManager.getRoomIdBySocketId(socketId);
  }

  /**
   * 강의실 세션이 활성 상태(개설자 접속 중)인지 확인합니다.
   */
  isClassroomActive(classroomId) {
    return this.roomManager.isClassroomActive(classroomId);
  }

  /**
   * 강의실 세션 상태를 완전히 정리합니다.
   */
  endClassroomSession(classroomId) {
    this.roomManager.endClassroomSession(classroomId, this.userManager.userRoomMap);
  }
}

module.exports = SocketStateManager;