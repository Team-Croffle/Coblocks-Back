// src/socket/handlers.js (최종 정리본 - 디버깅 로그 제거)

const logger = require("../utils/logger");
const events = require("./events");
const Classroom = require("../models/Classroom"); // DB 삭제 위해 모델 필요

// stateManager, io는 setup.js에서 인자로 전달받음

/**
 * 사용자의 강의실 참여 요청(JOIN_CLASSROOM 이벤트)을 처리합니다.
 */
async function handleJoinClassroom(socket, data, stateManager, io) {
  // logger.info(`[Handler] handleJoinClassroom called for socket: ${socket.id}`); // 필요시 유지 또는 제거
  try {
    const socketId = socket.id;
    const userId = socket.userId;
    const username = socket.userName;
    const classroomDetails = data?.classroomDetails;

    if (!userId) {
      logger.warn(
        `[Handler] Missing userId for socket ${socketId} during join`
      );
      socket.emit(events.ERROR, { message: "Authentication required." });
      return;
    }
    if (
      !classroomDetails ||
      !classroomDetails.classroom_id ||
      !classroomDetails.classroom_code ||
      !classroomDetails.manager_users_id
    ) {
      logger.warn(
        `[Handler] Invalid classroomDetails received for join from ${socketId}`,
        data
      );
      socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
        success: false,
        message: "Invalid classroom data provided.",
      });
      return;
    }

    const classroomId = classroomDetails.classroom_id;
    const classroomCode = classroomDetails.classroom_code;
    const isManager = userId === classroomDetails.manager_users_id;

    logger.info(
      `[Handler] User ${userId}(${username}, ${socketId}) attempting to join room ${classroomId} (${classroomCode}). Manager: ${isManager}`
    );

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
      logger.error(
        `[Handler] Failed to add user ${userId} to state for room ${classroomId}: ${addResult.message}`
      );
      socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
        success: false,
        message: addResult.message,
      });
      return;
    }

    if (addResult.previousRoomId) {
      socket.leave(addResult.previousRoomId);
      logger.info(
        `[Handler] Socket ${socketId} left previous room ${addResult.previousRoomId}.`
      );
    }
    socket.join(classroomId);
    logger.info(
      `[Handler] Socket ${socketId} joined Socket.IO room: ${classroomId}`
    );

    // <<<--- [수정] 디버깅 로그 및 임시 배열 확인 로직 제거 ---<<<
    const usersInRoom = stateManager.getUsersInClassroom(classroomId);
    // 이제 usersInRoom은 항상 배열이라고 가정하고 바로 사용
    const simplifiedUsers = usersInRoom.map((u) => ({
      userId: u.userId,
      username: u.username,
    }));

    // 6. 참여 성공 응답 (JOIN_CLASSROOM_SUCCESS)
    socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
      success: true,
      message: "Successfully joined classroom.",
      classroom: classroomDetails,
      users: simplifiedUsers, // 간소화된 목록 전달
      isManager: isManager,
    });

    // 7. 다른 사용자들에게 참여 알림 (USER_JOINED_CLASSROOM)
    socket.to(classroomId).emit(events.USER_JOINED_CLASSROOM, {
      userId: userId,
      username: username,
      users: simplifiedUsers, // 간소화된 목록 전달
    });
    logger.info(
      `[Handler] Broadcasted USER_JOINED_CLASSROOM with ${simplifiedUsers.length} users to room ${classroomId}.`
    );
  } catch (error) {
    logger.error(
      `[Handler] Error in handleJoinClassroom for socket ${socket?.id}: ${error.message}`,
      error
    );
    if (socket) {
      socket.emit(events.ERROR, {
        message: "An error occurred while joining the classroom.",
      });
    }
  }
}

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
      // logger.warn(`[Handler] Empty message received from ${userId}(${socketId}).`); // 필요시 로깅 유지
      // 클라이언트에게 에러 전송 (보통 빈 메시지는 무시하거나 프론트에서 막음)
      // socket.emit(events.MESSAGE_ERROR, { message: "Message cannot be empty." });
      return; // 빈 메시지는 무시
    }
    if (!userId || !username) {
      logger.error(
        `[Handler] Missing auth info on socket ${socketId} trying to send message.`
      );
      socket.emit(events.MESSAGE_ERROR, { message: "Authentication error." });
      return;
    }

    const roomId = stateManager.getRoomIdBySocketId(socketId);

    if (!roomId) {
      logger.warn(
        `[Handler] User ${userId}(${socketId}) tried to send message but not in a room.`
      );
      socket.emit(events.MESSAGE_ERROR, {
        message: "You are not currently in a classroom.",
      });
      return;
    }

    const messageData = {
      userId: userId,
      username: username,
      message: message,
      timestamp: new Date().toISOString(),
    };

    io.to(roomId).emit(events.CLASSROOM_MESSAGE, messageData);

    // logger.info(`[Handler] User ${userId}(${username}) sent message to room ${roomId}: "${message}"`); // 성공 로그는 필요시 유지
  } catch (error) {
    logger.error(
      `[Handler] Error in handleSendMessage for socket ${socket?.id}: ${error.message}`,
      error
    );
    if (socket) {
      socket.emit(events.ERROR, {
        message: "An error occurred while sending the message.",
      });
    }
  }
}

/**
 * 클라이언트 소켓 연결 해제(disconnect 이벤트)를 처리합니다.
 */
async function handleDisconnect(socket, stateManager, io, reason) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;

  logger.info(
    `[Handler] handleDisconnect called for socket: ${socketId}, User: ${userId}, Reason: ${reason}`
  );

  try {
    // DB 작업 등 비동기 작업이 있을 수 있으므로 try-catch 추가 고려
    const removeResult = stateManager.removeUser(socketId);

    if (removeResult.success) {
      if (removeResult.endedClassroomDetails) {
        const endedRoom = removeResult.endedClassroomDetails;
        logger.info(
          `[Handler] Manager ${
            userId || "N/A"
          }(${socketId}) disconnected. Ending session for room ${endedRoom.id}.`
        );
        io.to(endedRoom.id).emit(events.CLASSROOM_DELETED, {
          classroomId: endedRoom.id,
          message: `Classroom session ended as manager (${
            username || userId || "Unknown"
          }) disconnected.`,
        });
        logger.info(
          `[Handler] Broadcasted CLASSROOM_DELETED to room ${endedRoom.id}.`
        );
        try {
          const socketsInRoom = await io.in(endedRoom.id).fetchSockets();
          socketsInRoom.forEach((sock) => {
            if (sock.id !== socketId) {
              logger.info(
                `[Handler] Force disconnecting socket ${sock.id} from ended room ${endedRoom.id}.`
              );
              sock.disconnect(true);
            }
          });
        } catch (err) {
          logger.error(
            `[Handler] Error fetching/disconnecting sockets in ended room ${endedRoom.id}: ${err.message}`
          );
        }
        try {
          await Classroom.delete(endedRoom.id);
          logger.info(
            `[Handler] Classroom ${endedRoom.id} deleted from DB due to manager disconnect.`
          );
        } catch (dbError) {
          logger.error(
            `[Handler] Failed to delete classroom ${endedRoom.id} from DB: ${dbError.message}`
          );
        }
      } else if (removeResult.roomId) {
        const roomId = removeResult.roomId;
        const remainingUsers = removeResult.usersInRoom;
        const simplifiedUsers = remainingUsers.map((u) => ({
          userId: u.userId,
          username: u.username,
        }));
        io.to(roomId).emit(events.USER_LEFT_CLASSROOM, {
          userId: userId,
          username: username,
          users: simplifiedUsers,
        });
        logger.info(
          `[Handler] Broadcasted USER_LEFT_CLASSROOM with ${simplifiedUsers.length} users to room ${roomId} after user ${userId} disconnected.`
        );
      }
    } else {
      logger.warn(
        `[Handler] removeUser failed or user ${socketId} was not in a room during disconnect. Message: ${removeResult.message}`
      );
    }
  } catch (error) {
    logger.error(
      `[Handler] Error in handleDisconnect for socket ${socketId}: ${error.message}`,
      error
    );
  }
}

// module.exports 업데이트
module.exports = {
  handleJoinClassroom,
  handleSendMessage,
  handleDisconnect,
};
