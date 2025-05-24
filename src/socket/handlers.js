const logger = require("../utils/logger");
const events = require("./events");
const Classroom = require("../models/Classroom"); // DB 삭제 위해 모델 필요
const Quest = require("../models/Quest");

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

    // 강의실 정보 추출
    const classroomId = classroomDetails.classroom_id;
    const classroomCode = classroomDetails.classroom_code;
    const isManager = userId === classroomDetails.manager_users_id;

    // 개설자가 아닌 경우 최대 인원 제한 확인
    if (!isManager && stateManager.roomManager.getRoom(classroomId)) {
      // 이미 존재하는 방에 일반 사용자로 참여하는 경우
      if (!stateManager.roomManager.canJoinRoom(classroomId)) {
        logger.warn(
          `[Handler] Join denied for user ${userId}(${socketId}) to room ${classroomId}: Maximum capacity (4) reached.`
        );
        socket.emit(events.JOIN_CLASSROOM_SUCCESS, {
          success: false,
          message:
            "Cannot join: Classroom has reached maximum capacity of 4 users.",
        });
        return;
      }
    }

    logger.info(
      `[Handler] User ${userId}(${username}, ${socketId}) attempting to join room ${classroomId} (${classroomCode}). Manager: ${isManager}`
    );

    // 현재 방 참여자 수 로깅
    if (stateManager.roomManager.getRoom(classroomId)) {
      const currentUserCount =
        stateManager.roomManager.getUserCount(classroomId);
      logger.info(
        `[Handler] Current user count in room ${classroomId}: ${currentUserCount}/4`
      );
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
      userCount: simplifiedUsers.length,
      maxUsers: 4, // 최대 인원 정보 추가
    });

    // 7. 다른 사용자들에게 참여 알림 (USER_JOINED_CLASSROOM)
    socket.to(classroomId).emit(events.USER_JOINED_CLASSROOM, {
      joinedUser: {
        userId: userId,
        username: username, // 05/11 추가
      },
      userCount: simplifiedUsers.length,
      maxUsers: 4,
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
        userCount: simplifiedUsers.length,
        maxUsers: 4,
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

    // 3. 참가자 목록 갱신 응답 (최대 인원 정보 포함)
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
          leftUser: {
            userId: userId,
            username: username,
          },
          users: simplifiedUsers,
          userCount: simplifiedUsers.length,
          maxUsers: 4,
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

// 클라이언트의 에디터 내용 변경 요청(editorContentChange 이벤트)을 처리합니다. // 폐기?
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

// 클라이언트의 문제 세트 선택 요청(selectProblemSet 이벤트)을 처리합니다.
async function handleSelectProblemSet(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const { quest_id } = data;

  if (!quest_id) {
    logger.warn(
      `[Handler SelectProblemSet] Missing quest_id from <span class="math-inline">\{userId\}\(</span>{socketId}).`
    );
    socket.emit(events.ERROR, { message: "Quest ID is required." });
    return;
  }

  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(`[Handler] no roomId found for socket ${socketId}`);
    socket.emit(events.ERROR, {
      message: "You are not currently in a classroom.",
    });
    return;
  }

  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);

  if (!room) {
    logger.warn(
      `[Handler SelectProblemSet] Room ${roomId} not found for user <span class="math-inline">\{userId\}\(</span>{socketId}).`
    );
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  // 개설자 권한 확인
  if (room.managerSocketId !== socketId) {
    logger.warn(
      `[Handler SelectProblemSet] User <span class="math-inline">\{userId\}\(</span>{socketId}) is not the manager of room ${roomId}. Attempted to select problem.`
    );
    socket.emit(events.ERROR, {
      message: "Only the manager can select a problem.",
    });
    return;
  }

  // 문제 정보 가져오기
  try {
    const quest = await Quest.findQuestById(quest_id);
    if (!quest) {
      logger.error(
        `[Handler] No questInfo found for ID ${data.quest_id} during problem set selection.`
      );
      socket.emit(events.ERROR, { message: "Quest not found." });
      return;
    }

    // RoomManager 상태 업데이트 (선택된 문제 저장)
    roomManager.setSelectedQuest(roomId, quest);

    // 문제 세트 정보 저장
    const payload = { questInfo: quest };

    io.to(roomId).emit(events.PROBLEM_SELECTED_INFO, payload);
    logger.info(
      `[Handler SelectProblemSet] Problem ${quest_id} selected in room ${roomId} by manager ${userId}. Info (raw) broadcasted.`
    );
  } catch (error) {
    logger.error(
      `[Handler SelectProblemSet] Error processing quest selection for ${quest_id} in room ${roomId}: ${error.message}`,
      error
    );
    socket.emit(events.ERROR, {
      message: "Failed to select problem due to a server error.",
    });
  }
}

// 클라이언트의 문제 풀이 시작 요청(startActivity 이벤트)을 처리합니다.
async function handleStartActivity(socket, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName; // 소켓 인증 시 저장된 사용자 이름

  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(
      `[Handler StartActivity] User ${userId}(${socketId}, ${username}) not in a room.`
    );
    socket.emit(events.ERROR, { message: "You are not in a classroom." });
    return;
  }

  const roomManager = stateManager.roomManager; // RoomManager 인스턴스 접근
  const room = roomManager.getRoom(roomId);
  if (!room) {
    logger.warn(
      `[Handler StartActivity] Room ${roomId} not found for user ${userId}(${socketId}, ${username}).`
    );
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  // 1. 개설자 권한 확인
  if (room.managerSocketId !== socketId) {
    logger.warn(
      `[Handler StartActivity] User ${userId}(${socketId}, ${username}) is not the manager of room ${roomId}.`
    );
    socket.emit(events.ERROR, {
      message: "Only the manager can start the activity.",
    });
    return;
  }

  // 2. 이미 활동이 시작되었는지 확인
  if (room.activityStarted) {
    logger.warn(
      `[Handler StartActivity] Activity already started in room ${roomId}. Request by ${userId}(${socketId}, ${username}).`
    );
    // 이미 시작되었다는 것을 알려주거나, 무시할 수 있습니다. 여기서는 에러로 처리.
    socket.emit(events.ERROR, { message: "Activity has already started." });
    return;
  }

  // 3. 문제가 선택되었는지 확인
  if (!room.currentQuestId || !room.currentQuestDetails) {
    logger.warn(
      `[Handler StartActivity] No problem selected in room ${roomId} to start activity. Request by ${userId}(${socketId}, ${username}).`
    );
    socket.emit(events.ERROR, {
      message: "A problem must be selected before starting the activity.",
    });
    return;
  }

  // 4. 현재 참여자 목록 가져오기
  const participants = stateManager.getUsersInClassroom(roomId); // [{userId, username, socketId}, ...]
  if (participants.length === 0) {
    logger.warn(
      `[Handler StartActivity] No participants in room ${roomId} to start activity. Request by ${userId}(${socketId}, ${username}).`
    );
    socket.emit(events.ERROR, {
      message: "There are no participants to start the activity with.",
    });
    return;
  }

  // 5. 참여자들에게 파트 번호 배정
  //    (예: 단순 참여 순서대로 1, 2, 3, 4... 배정. 최대 4명이라고 가정)
  const assignments = participants.map((participant, index) => {
    return {
      userId: participant.userId,
      username: participant.username,
      socketId: participant.socketId,
      partNumber: index + 1, // 1부터 시작하는 파트 번호
    };
  });

  // 6. RoomManager 상태 업데이트 (활동 시작 플래그, 파트 배정 정보 저장)
  roomManager.setActivityStateAndAssignments(roomId, true, assignments); // isStarted: true

  // 7. 각 참여자에게 ACTIVITY_BEGAN 이벤트 개별 전송
  assignments.forEach((assignment) => {
    const targetSocketId = assignment.socketId;
    const assignedPartNumber = assignment.partNumber;
    const questDetails = room.currentQuestDetails; // RoomManager에 저장된 원본 문제 정보

    let finalQuestContentForUser; // 참여자에게 전달될 최종 문제(Blockly) 정보 JSON
    let finalQuestQuestionForUser; // 참여자에게 전달될 최종 문제 설명 (문자열?)

    if (questDetails.quest_context.is_equal == true) {
      // 공통 문제
      finalQuestContentForUser =
        questDetails.quest_context.player1 || questDetails.quest_context.common;
      finalQuestQuestionForUser = questDetails.quest_question; // question이 문자열이라고 가정
    } else {
      // 개인 문제
      const playerKey = `player${assignedPartNumber}`;
      finalQuestContentForUser = questDetails.quest_context[playerKey];

      // quest_question도 객체이므로, playerKey로 해당 설명을 가져옴
      finalQuestQuestionForUser = questDetails.quest_question[playerKey];
    }

    // 안전장치: 만약 해당 playerKey에 대한 정보가 없다면 기본값 또는 에러 처리
    if (finalQuestContentForUser === undefined) {
      logger.warn(
        `[Handler StartActivity] Blockly content for ${playerKey} not found in quest ${questDetails.quest_id}. Room: ${roomId}`
      );
      finalQuestContentForUser = {}; // 빈 객체 또는 기본 Blockly 상태
    }
    if (finalQuestQuestionForUser === undefined) {
      logger.warn(
        `[Handler StartActivity] Question text for ${playerKey} not found in quest ${questDetails.quest_id}. Room: ${roomId}`
      );
      finalQuestQuestionForUser = "문제 설명을 가져올 수 없습니다."; // 기본 메시지
    }

    const payload = {
      questInfo: {
        // 공통 정보
        id: questDetails.quest_id,
        overall_description: questDetails.quest_description, // 문제의 전체적인 제목/설명
        difficulty: questDetails.quest_difficulty,
        type: questDetails.quest_type,
        is_equal: questDetails.quest_context.is_equal,

        // 참여자별 개별화된 정보
        blockly_workspace: finalQuestContentForUser, // 해당 파트의 Blockly 정보 (JSON 객체)
        detailed_question: finalQuestQuestionForUser, // 해당 파트의 문제 설명 (문자열)
        default_stage: questDetails.default_stage, // Blockly 기본 세팅 (공통으로 가정)
      },
      myPartNumber: assignedPartNumber,
      allParticipantAssignments: assignments,
    };

    io.to(targetSocketId).emit(events.ACTIVITY_BEGIN, payload); // events.js에 정의된 이벤트 이름 사용
  });

  logger.info(
    `[Handler StartActivity] Activity successfully started in room ${roomId} by manager ${userId}(${socketId}, ${username}). Parts assigned and events sent to ${assignments.length} participants.`
  );
}

// 클라이언트의 문제 풀이 제출 요청(submitSolution 이벤트)을 처리합니다.
async function handleSubmitSolution(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;

  // 1. 입력 데이터 유효성 검사
  if (!data || data.submissionContent === undefined) {
    // submissionContent가 null일 수도 있으므로 undefined와 비교
    logger.warn(
      `[Handler SubmitSolution] Invalid data from ${userId}(${socketId}, ${username}). Missing submissionContent.`
    );
    socket.emit(events.ERROR, { message: "Submission content is missing." });
    return;
  }
  const submissionContent = data.submissionContent; // client가 보낸 문제

  // 2. 사용자가 현재 유효한 방에 있는지, 활동이 시작되었는지 확인
  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(
      `[Handler SubmitSolution] User ${userId}(${socketId}, ${username}) not in a room.`
    );
    socket.emit(events.ERROR, {
      message: "You are not currently in a classroom.",
    });
    return;
  }

  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);

  if (!room) {
    // 이 경우는 거의 없어야 함 (getRoomIdBySocketId가 roomId를 반환했다면)
    logger.error(
      `[Handler SubmitSolution] Room ${roomId} not found in RoomManager despite user ${userId}(${socketId}, ${username}) being mapped to it.`
    );
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  if (!room.activityStarted) {
    logger.warn(
      `[Handler SubmitSolution] Activity not started in room ${roomId}. Submission attempt by ${userId}(${socketId}, ${username}).`
    );
    socket.emit(events.ERROR, { message: "Activity has not started yet." });
    return;
  }

  // 3. 사용자의 파트 번호 확인 (RoomManager에 저장된 participantAssignments 사용)
  const assignment = room.participantAssignments.find(
    (a) => a.userId === userId
  );
  if (!assignment) {
    logger.warn(
      `[Handler SubmitSolution] User ${userId}(${socketId}, ${username}) has no part assignment in room ${roomId}.`
    );
    socket.emit(events.ERROR, {
      message: "You do not have an assigned part for this activity.",
    });
    return;
  }
  const partNumber = assignment.partNumber;

  // 4. RoomManager를 통해 제출물 저장/업데이트
  try {
    // RoomManager.updateUserSubmission 메소드는 (classroomId, userId, submissionContent) 인자를 받음
    const submissionSuccessful = roomManager.updateUserSubmission(
      roomId,
      userId,
      partNumber,
      submissionContent
    );
    logger.info(
      `[Handler SubmitSolution] User(${username}, Part ${partNumber}) successfully submitted solution in room ${roomId}.`
    );

    // 5. 제출 성공 응답 (SUBMIT_SOLUTION_SUCCESS)
    io.to(roomId).emit(events.SUBMIT_SOLUTION_SUCCESS, {
      username: username,
      partNumber: partNumber,
      message: `${username} has submitted their solution for Part ${partNumber}.`,
    });
  } catch (error) {
    logger.error(
      `[Handler SubmitSolution] Failed to update submission for user ${userId}(${username}, Part ${partNumber}) in room ${roomId}: ${error.message}`
    );
    socket.emit(events.ERROR, {
      success: false,
      message: "Failed to save your submission. Please try again.",
    });
  }
}

// 클라이언트의 최종 제출 요청(requestFinalSubmission 이벤트)을 처리합니다.
async function handleRequestFinalSubmission(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;

  // 1. 사용자가 현재 유효한 방에 있는지 확인
  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(
      `[Handler RequestFinalSubmission] User ${userId}(${socketId}, ${username}) not in a room.`
    );
    socket.emit(events.ERROR, {
      message: "You are not currently in a classroom.",
    });
    return;
  }

  // 2. 방 정보 가져오기
  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);
  if (!room) {
    logger.warn(
      `[Handler RequestFinalSubmission] Room ${roomId} not found for user ${userId}(${socketId}, ${username}).`
    );
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  // 3. 개설자 권한 확인
  if (room.managerSocketId !== socketId) {
    logger.warn(
      `[Handler RequestFinalSubmission] User ${userId}(${socketId}, ${username}) is not the manager of room ${roomId}.`
    );
    socket.emit(events.ERROR, {
      message: "Only the manager can request final submissions.",
    });
    return;
  }

  // 4. RoomManager를 통해 모든 참여자의 제출물 가져오기
  const allSubmissions = roomManager.getAllSubmissionsForRoom(roomId);
  // allSubmissions의 형태: { "userId1": { partNumber: 1, content: "..."  }, ... }

  // 5. 모든 참여자에게 FINAL_SUBMISSIONS_DATA 이벤트 브로드캐스트
  const payload = {
    finalSubmissions: allSubmissions,
  };

  io.to(roomId).emit(events.FINAL_SUBMISSIONS_DATA, payload);
  logger.info(
    `[Handler ReqFinalSub] Final submissions data for room ${roomId} broadcasted by manager ${userId}(${socketId}, ${username}).`
  );
}

// module.exports 업데이트
module.exports = {
  handleJoinClassroom,
  handleSendMessage,
  handleRefreshParticipantList,
  handleDisconnect,
  handleLeaveClassroom,
  handleEditorContentChange,
  handleSelectProblemSet,
  handleStartActivity,
  handleSubmitSolution,
  handleRequestFinalSubmission,
};
