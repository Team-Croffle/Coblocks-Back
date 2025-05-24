/**
 * 강의실 관련 소켓 이벤트 핸들러
 */
const logger = require("../../utils/logger");
const events = require("../events");
const Classroom = require("../../models/Classroom");
const { validateRoom, validateManager } = require('./validation');

/**
 * 사용자의 강의실 참여 요청(JOIN_CLASSROOM 이벤트)을 처리합니다.
 */
async function handleJoinClassroom(socket, data, stateManager, io) {
  try {
    const socketId = socket.id;
    const userId = socket.userId;
    const username = socket.userName;
    const classroomDetails = data?.classroomDetails;

    if (!userId) {
      logger.warn(`[Handler] Missing userId for socket ${socketId} during join`);
      socket.emit(events.ERROR, { message: "Authentication required." });
      return;
    }
    
    if (!classroomDetails || !classroomDetails.classroom_id || 
        !classroomDetails.classroom_code || !classroomDetails.manager_users_id) {
      logger.warn(`[Handler] Invalid classroomDetails received for join from ${socketId}`, data);
      socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
        success: false,
        message: "Invalid classroom data provided.",
      });
      return;
    }

    // 강의실 정보 추출
    const classroomId = classroomDetails.classroom_id;
    const classroomCode = classroomDetails.classroom_code;
    const isManager = userId === classroomDetails.manager_users_id;

    // 개설자가 아닌 경우 최대 인원 제한 확인
    if (!isManager && stateManager.roomManager.getRoom(classroomId)) {
      // 이미 존재하는 방에 일반 사용자로 참여하는 경우
      if (!stateManager.roomManager.canJoinRoom(classroomId)) {
        logger.warn(`[Handler] Join denied for user ${userId}(${socketId}) to room ${classroomId}: Maximum capacity (4) reached.`);
        socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
          success: false,
          message: "Cannot join: Classroom has reached maximum capacity of 4 users.",
        });
        return;
      }
    }

    logger.info(`[Handler] User ${userId}(${username}, ${socketId}) attempting to join room ${classroomId} (${classroomCode}). Manager: ${isManager}`);

    // 현재 방 참여자 수 로깅
    if (stateManager.roomManager.getRoom(classroomId)) {
      const currentUserCount = stateManager.roomManager.getUserCount(classroomId);
      logger.info(`[Handler] Current user count in room ${classroomId}: ${currentUserCount}/4`);
    }

    const addResult = stateManager.addUser(
      socketId,
      userId,
      username,
      classroomId,
      classroomCode,
      isManager,
      classroomDetails
    );

    if (!addResult.success) {
      logger.error(`[Handler] Failed to add user ${userId} to state for room ${classroomId}: ${addResult.message}`);
      socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
        success: false,
        message: addResult.message,
      });
      return;
    }

    if (addResult.previousRoomId) {
      socket.leave(addResult.previousRoomId);
      logger.info(`[Handler] Socket ${socketId} left previous room ${addResult.previousRoomId}.`);
    }
    
    socket.join(classroomId);
    logger.info(`[Handler] Socket ${socketId} joined Socket.IO room: ${classroomId}`);

    const usersInRoom = stateManager.getUsersInClassroom(classroomId);
    const simplifiedUsers = usersInRoom.map((u) => ({
      userId: u.userId,
      username: u.username,
    }));

    // 참여 성공 응답 (JOIN_CLASSROOM_SUCCESS)
    socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
      success: true,
      message: "Successfully joined classroom.",
      classroom: classroomDetails,
      users: simplifiedUsers,
      isManager: isManager,
      userCount: simplifiedUsers.length,
      maxUsers: 4,
    });

    // 다른 사용자들에게 참여 알림 (USER_JOINED_CLASSROOM)
    socket.to(classroomId).emit(events.USER_JOINED_CLASSROOM, {
      joinedUser: {
        userId: userId,
        username: username,
      },
      userCount: simplifiedUsers.length,
      maxUsers: 4,
    });
    
    logger.info(`[Handler] Broadcasted USER_JOINED_CLASSROOM with ${simplifiedUsers.length} users to room ${classroomId}.`);
  } catch (error) {
    logger.error(`[Handler] Error in handleJoinClassroom for socket ${socket?.id}: ${error.message}`, error);
    if (socket) {
      socket.emit(events.ERROR, {
        message: "An error occurred while joining the classroom.",
      });
    }
  }
}

/**
 * 사용자의 강의실 퇴장 요청(LEAVE_CLASSROOM 이벤트)을 처리합니다.
 */
async function handleLeaveClassroom(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;
  logger.info(`[Handler] handleLeaveClassroom called for socket: ${socketId}, User: ${userId}`);

  // 상태 관리자에서 사용자 제거 시도
  const removeResult = stateManager.removeUser(socketId);

  if (removeResult.success) {
    // 사용자가 상태에서 성공적으로 제거됨
    if (removeResult.endedClassroomDetails) {
      // 나간 사용자가 개설자였음 -> 세션 종료 처리
      const endedRoom = removeResult.endedClassroomDetails;
      logger.info(`[Handler] Manager ${userId || "N/A"}(${socketId}) explicitly left. Ending session for room ${endedRoom.id}.`);

      // 남은 사용자들에게 방 삭제 알림 발송
      io.to(endedRoom.id).emit(events.CLASSROOM_DELETED, {
        classroomId: endedRoom.id,
        message: `Classroom session ended as manager (${username || userId || "Unknown"}) left.`,
      });
      
      logger.info(`[Handler] Broadcasted CLASSROOM_DELETED to room ${endedRoom.id}.`);

      // 남은 사용자들 강제 연결 해제
      try {
        const socketsInRoom = await io.in(endedRoom.id).fetchSockets();
        socketsInRoom.forEach((sock) => {
          if (sock.id !== socketId) {
            logger.info(`[Handler] Force disconnecting socket ${sock.id} from ended room ${endedRoom.id}.`);
            sock.disconnect(true);
          }
        });
      } catch (err) {
        logger.error(`[Handler] Error fetching/disconnecting sockets in ended room ${endedRoom.id}: ${err.message}`);
      }

      // 데이터베이스에서 강의실 삭제
      try {
        await Classroom.delete(endedRoom.id);
        logger.info(`[Handler] Classroom ${endedRoom.id} deleted from DB due to manager leaving.`);
      } catch (dbError) {
        logger.error(`[Handler] Failed to delete classroom ${endedRoom.id} from DB: ${dbError.message}`);
      }
    } else if (removeResult.roomId) {
      // 일반 사용자가 나감
      const roomId = removeResult.roomId;
      const remainingUsers = removeResult.usersInRoom;
      const simplifiedUsers = remainingUsers.map((u) => ({
        userId: u.userId,
        username: u.username,
      }));

      // 남은 사용자들에게 퇴장 알림 및 갱신된 사용자 목록 발송
      io.to(roomId).emit(events.USER_LEFT_CLASSROOM, {
        leftUser: {
          userId: userId,
          username: username,
        },
        userCount: simplifiedUsers.length,
        maxUsers: 4,
      });
      
      logger.info(`[Handler] Broadcasted USER_LEFT_CLASSROOM with ${simplifiedUsers.length} users to room ${roomId} after user ${userId} left.`);
    }
  } else {
    // 사용자가 어떤 방에도 속해있지 않았거나 제거 중 오류 발생
    logger.warn(`[Handler] removeUser failed or user ${socketId} was not in a room during leave request. Message: ${removeResult.message}`);
  }
}

/**
 * 클라이언트의 참가자 목록 갱신 요청(refreshParticipantList 이벤트)을 처리합니다.
 */
async function handleRefreshParticipantList(socket, stateManager, ackCallback) {
  try {
    const socketId = socket.id;
    const roomId = stateManager.getRoomIdBySocketId(socketId);

    // 방에 참가 중인지 확인
    if (!roomId) {
      ackCallback({ success: false, message: "You are not in a classroom." });
      return;
    }

    // 방에 참가 중인 사용자 목록 가져오기
    const usersInRoom = stateManager.getUsersInClassroom(roomId);
    const simplifiedUsers = usersInRoom.map((u) => ({
      userId: u.userId,
      username: u.username,
    }));

    // 참가자 목록 갱신 응답 (최대 인원 정보 포함)
    ackCallback({
      success: true,
      users: simplifiedUsers,
      userCount: simplifiedUsers.length,
      maxUsers: 4,
    });
  } catch (error) {
    ackCallback({ success: false, message: "An error occurred." });
  }
}

module.exports = {
  handleJoinClassroom,
  handleLeaveClassroom,
  handleRefreshParticipantList
};