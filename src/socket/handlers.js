const logger = require("../utils/logger");
const events = require("./events");
const Classroom = require("../models/Classroom"); // DB 삭제 위해 모델 필요

// stateManager, io는 setup.js에서 인자로 전달받음

/**
 * 사용자의 강의실 참여 요청(JOIN_CLASSROOM 이벤트)을 처리합니다.
 */
async function handleJoinClassroom(socket, data, stateManager, io) {
  // logger.info(`[Handler] handleJoinClassroom called for socket: ${socket.id}`); // 필요시 유지
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

    const usersInRoom = stateManager.getUsersInClassroom(classroomId);
    // StateManager.getUsersInClassroom은 항상 배열을 반환하므로 바로 map 사용
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
      joinedUser: {
        userId: userId,
        username: username, // 05/11 추가
      },
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

async function handleLeaveClassroom(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;
  logger.info(
    `[Handler] handleLeaveClassroom called for socket: ${socketId}, User: ${userId}`
  );

  // 1. 상태 관리자에서 사용자 제거 시도
  const removeResult = stateManager.removeUser(socketId);

  if (removeResult.success) {
    // 사용자가 상태에서 성공적으로 제거됨
    if (removeResult.endedClassroomDetails) {
      // 2a. 나간 사용자가 개설자였음 -> 세션 종료 처리
      const endedRoom = removeResult.endedClassroomDetails;
      logger.info(
        `[Handler] Manager ${
          userId || "N/A"
        }(${socketId}) explicitly left. Ending session for room ${
          endedRoom.id
        }.`
      );

      // 남은 사용자들에게 방 삭제 알림 발송
      io.to(endedRoom.id).emit(events.CLASSROOM_DELETED, {
        classroomId: endedRoom.id,
        message: `Classroom session ended as manager (${
          username || userId || "Unknown"
        }) left.`, // 메시지 수정
      });
      logger.info(
        `[Handler] Broadcasted CLASSROOM_DELETED to room ${endedRoom.id}.`
      );

      // (선택사항) 남은 사용자들 강제 연결 해제
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

      // 데이터베이스에서 강의실 삭제 (RLS 정책 및 구현 방식에 따라 성공/실패 결정됨)
      try {
        await Classroom.delete(endedRoom.id);
        logger.info(
          `[Handler] Classroom ${endedRoom.id} deleted from DB due to manager leaving.`
        );
      } catch (dbError) {
        logger.error(
          `[Handler] Failed to delete classroom ${endedRoom.id} from DB: ${dbError.message}`
        );
      }
    } else if (removeResult.roomId) {
      // 2b. 일반 사용자가 나감
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
      });
      logger.info(
        `[Handler] Broadcasted USER_LEFT_CLASSROOM with ${simplifiedUsers.length} users to room ${roomId} after user ${userId} left.`
      );
    }

    // 3. 클라이언트가 스스로 나가는 경우가 많으므로, 소켓 연결을 여기서 끊지는 않음
    //    클라이언트의 leave 버튼 핸들러에서 hideChatContainer() 등을 호출하여 UI 정리
    //    필요시 성공/실패 응답 이벤트 발송 고려
    // socket.emit(events.LEAVE_CLASSROOM_SUCCESS, { success: true });
  } else {
    // 사용자가 어떤 방에도 속해있지 않았거나 제거 중 오류 발생
    logger.warn(
      `[Handler] removeUser failed or user ${socketId} was not in a room during leave request. Message: ${removeResult.message}`
    );
    // 클라이언트에게 오류 응답 발송 고려
    // socket.emit(events.LEAVE_CLASSROOM_SUCCESS, { success: false, message: removeResult.message });
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
      // logger.warn(`[Handler] Empty message received from ${userId}(${socketId}).`);
      return; // 빈 메시지 무시
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

    // logger.info(`[Handler] User ${userId}(${username}) sent message to room ${roomId}: "${message}"`); // 성공 로그 필요시 유지
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
 * 클라이언트의 참가자 목록 갱신 요청(refreshParticipantList 이벤트)을 처리합니다.
 */
async function handleRefreshParticipantList(socket, stateManager, ackCallback) {
  try {
    const socketId = socket.id;
    const roomId = stateManager.getRoomIdBySocketId(socketId);

    // 1. 방에 참가 중인지 확인
    if (!roomId) {
      ackCallback({ success: false, message: "You are not in a classroom." });
      return;
    }

    // 2. 방에 참가 중인 사용자 목록 가져오기
    const usersInRoom = stateManager.getUsersInClassroom(roomId);
    const simplifiedUsers = usersInRoom.map((u) => ({
      userId: u.userId,
      username: u.username,
    }));

    // 3. 참가자 목록 갱신 응답
    ackCallback({ success: true, users: simplifiedUsers });
  } catch (error) {
    ackCallback({ success: false, message: "An error occurred." });
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
    // 연결 끊김 처리 중 발생한 오류는 클라이언트에게 보내기 어려울 수 있음
  }
}

async function handleEditorContentChange(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;

  try {
    const roomId = stateManager.getRoomIdBySocketId(socketId);
    if (!roomId) {
      logger.warn(`[Handler] no roomId found for socket ${socketId}`);
      socket.emit(events.ERROR, {
        message: "You are not currently in a classroom.",
      });
    }

    // 현재 방의 정보 가져오기
    const roomState = stateManager.rooms[roomId];
    if (!roomState || !roomState.classroomDetails) {
      logger.error(
        `[Handler] No classroom details found for room ${roomId} during editor content change.`
      );
      socket.emit(events.ERROR, { message: "Room details not found." });
      return;
    }

    if (!data || !data.state === undefined) {
      logger.warn(
        `[Handler] Invalid data received for editor content change from ${userId}(${socketId}).`
      );
      socket.emit(events.ERROR, { message: "Editor content is missing." });
      return;
    }

    // 자신을 제외한 다른 참여자들에게 에디터 내용 브로드캐스트
    logger.info(`[Handler] data:'`, data);
    socket.to(roomId).emit(events.EDITOR_STATE_SYNC, data);
    logger.info(
      `[Handler] Editor state sync broadcasted to room ${roomId} from user ${userId}(${socketId}).`
    );
  } catch (error) {
    logger.error(
      `[Handler] Error in handleEditorContentChange for socket ${socketId}: ${error.message}`,
      error
    );
    socket.emit(events.ERROR, {
      message: "An error occurred while changing editor content.",
    });
  }
}

// module.exports 업데이트
module.exports = {
  handleJoinClassroom,
  handleSendMessage,
  handleRefreshParticipantList,
  handleDisconnect,
  handleLeaveClassroom,
  handleEditorContentChange,
};
