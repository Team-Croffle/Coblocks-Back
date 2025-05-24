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
        currentQuestId: null, // 현재 퀘스트 ID
        currentQuestDetails: null, // DB에서 원본 객체 전체 저장
        activityStarted: false, //활동 시작 여부 추가
        participantAssignments: [], // 참여자 파트 배정 정보 추가
        participantSubmissions: {}, // 제출된 문제 저장
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

    logger.info(
      `[RoomManager] State cleanup complete for classroom ${classroomId}.`
    );
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

  // 선택된 문제정보 저장
  setSelectedQuest(classroomId, questDetailsFromDB) {
    const room = this.rooms[classroomId];
    if (room) {
      room.currentQuestId = questDetailsFromDB.quest_id;
      room.currentQuestDetails = questDetailsFromDB;
      logger.info(
        `[RoomManager] Problem ${room.currentQuestId} (raw) stored for room ${classroomId}.`
      );
    } else {
      logger.warn(
        `[RoomManager] Attempted to set problem for non-existent room ${classroomId}`
      );
    }
  }

  // 활동 상태 및 참여자 파트 배정 정보 설정/업데이트
  setActivityStateAndAssignments(classroomId, started, assignments = []) {
    const room = this.getRoom(classroomId);
    if (room) {
      room.activityStarted = started;
      room.participantAssignments = started ? assignments : []; // 활동 시작 시 배정, 종료 시 초기화

      if (started) {
        logger.info(
          `[RoomManager] Activity set to ${started} with ${assignments.length} assignments in room ${classroomId}.`
        );
      } else {
        logger.info(
          `[RoomManager] Activity reset in room ${classroomId}. Assignments cleared.`
        );
      }
    } else {
      logger.warn(
        `[RoomManager] Attempted to set activity state for non-existent room ${classroomId}.`
      );
    }
  }

  // 특정 사용자의 제출물 업데이트
  updateUserSubmission(classroomId, userId, partNumber, submissionContent) {
    const room = this.getRoom(classroomId);
    if (room && room.activityStarted) {
      // 활동이 시작된 경우에만 제출 가능
      if (!room.participantSubmissions) {
        room.participantSubmissions = {};
      }

      room.participantSubmissions[userId] = {
        partNumber: partNumber,
        content: submissionContent,
      };
      logger.info(
        `[RoomManager] Submission updated for user ${userId} (Part ${partNumber}) in room ${classroomId}.`
      );
      return true;
    } else {
      logger.warn(
        `[RoomManager] Cannot update submission. Room ${classroomId} not found or activity not started.`
      );
      return false;
    }
  }

  // 특정 사용자의 제출물을 가져옴
  getUserSubmission(classroomId, userId) {
    const room = this.getRoom(classroomId);
    return room?.participantSubmissions?.[userId] || null;
  }

  // 해당 방의 모든 제출물을 가져옴
  getAllSubmissionsForRoom(classroomId) {
    const room = this.getRoom(classroomId);
    return room?.participantSubmissions || {};
  }

  //  participantSubmissions: {
  //    "userId_Alice": { // 참여자 Alice의 userId
  //      partNumber: 1, // Alice가 맡은 파트 번호
  //      content: { /* Blockly JSON 객체 또는 코드 문자열 */ }, // Alice의 제출 내용
  //  },
  //  "userId_Bob": { // 참여자 Bob의 userId
  //   partNumber: 2,
  //   content: { /* ... */ },
  //}
  //
}

module.exports = RoomManager;
