const logger = require("../utils/logger");

/**
 * 강의실(Room) 관련 상태 관리를 담당하는 클래스
 */
class RoomManager {
  constructor() {
    this.rooms = {};
    this.classroomManagerMap = {};
    this.maxUsersPerRoom = 4; // 강의실 최대 인원 4명으로 제한
  }

  /**
   * 새로운 강의실 세션을 초기화합니다.
   */
  initializeRoom(classroomId, socketId, classroomCode, classroomDetails) {
    if (!this.rooms[classroomId]) {
      logger.info(
        `[RoomManager] Initializing new room state for ${classroomId} with manager socket ${socketId}.`
      );
      this.rooms[classroomId] = {
        users: {}, // 사용자 목록 초기화
        managerSocketId: socketId, // 개설자 소켓 ID 설정
        classroomCode: classroomCode, // 강의실 코드 저장
        classroomDetails: classroomDetails, // 강의실 상세 정보 객체 저장
      };
      this.classroomManagerMap[classroomId] = socketId; // 활성 세션으로 표시
      return true;
    }
    return false;
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
  endClassroomSession(classroomId, userRoomMap) {
    const room = this.rooms[classroomId];
    if (!room) {
      logger.warn(
        `[RoomManager] Attempted to end session for non-existent room ${classroomId}`
      );
      return;
    }
    
    logger.info(
      `[RoomManager] Starting session state cleanup for classroom ${classroomId}.`
    );
    
    // 모든 사용자의 매핑 정보 제거
    Object.keys(room.users).forEach((sockId) => {
      delete userRoomMap[sockId];
    });
    
    // 강의실 관련 상태 정보 제거
    delete this.classroomManagerMap[classroomId];
    delete this.rooms[classroomId];
    
    logger.info(`[RoomManager] State cleanup complete for classroom ${classroomId}.`);
  }

  /**
   * 강의실 관리자 소켓 ID를 업데이트합니다.
   */
  updateManagerSocketId(classroomId, socketId) {
    if (this.rooms[classroomId]) {
      this.rooms[classroomId].managerSocketId = socketId;
      this.classroomManagerMap[classroomId] = socketId;
      return true;
    }
    return false;
  }

  /**
   * 강의실 정보를 반환합니다.
   */
  getRoom(classroomId) {
    return this.rooms[classroomId] || null;
  }

  /**
   * 강의실의 관리자 소켓 ID를 반환합니다.
   */
  getManagerSocketId(classroomId) {
    return this.rooms[classroomId]?.managerSocketId || null;
  }
  
  /**
   * 강의실의 현재 참여자 수를 반환합니다.
   */
  getUserCount(classroomId) {
    if (!this.rooms[classroomId]) return 0;
    return Object.keys(this.rooms[classroomId].users).length;
  }
  
  /**
   * 강의실에 새 사용자가 참여할 수 있는지 확인합니다.
   * @returns {boolean} 참여 가능 여부
   */
  canJoinRoom(classroomId) {
    if (!this.rooms[classroomId]) return false;
    
    const currentUserCount = this.getUserCount(classroomId);
    return currentUserCount < this.maxUsersPerRoom;
  }
}

module.exports = RoomManager;