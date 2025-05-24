/**
 * 활동 관련 소켓 이벤트 핸들러
 */
const logger = require("../../utils/logger");
const events = require("../events");
const Quest = require("../../models/Quest");
const { validateRoom, validateManager } = require('./validation');

/**
 * 클라이언트의 문제 세트 선택 요청(selectProblemSet 이벤트)을 처리합니다.
 */
async function handleSelectProblemSet(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const { quest_id } = data;

  if (!quest_id) {
    logger.warn(`[Handler SelectProblemSet] Missing quest_id from ${userId}(${socketId}).`);
    socket.emit(events.ERROR, { message: "Quest ID is required." });
    return;
  }

  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(`[Handler] no roomId found for socket ${socketId}`);
    socket.emit(events.ERROR, { message: "You are not currently in a classroom." });
    return;
  }

  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);

  if (!room) {
    logger.warn(`[Handler SelectProblemSet] Room ${roomId} not found for user ${userId}(${socketId}).`);
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  // 개설자 권한 확인
  if (room.managerSocketId !== socketId) {
    logger.warn(`[Handler SelectProblemSet] User ${userId}(${socketId}) is not the manager of room ${roomId}. Attempted to select problem.`);
    socket.emit(events.ERROR, { message: "Only the manager can select a problem." });
    return;
  }

  // 문제 정보 가져오기
  try {
    const quest = await Quest.findQuestById(quest_id);
    if (!quest) {
      logger.error(`[Handler] No questInfo found for ID ${data.quest_id} during problem set selection.`);
      socket.emit(events.ERROR, { message: "Quest not found." });
      return;
    }

    // RoomManager 상태 업데이트 (선택된 문제 저장)
    roomManager.setSelectedQuest(roomId, quest);

    // 문제 세트 정보 저장
    const payload = { questInfo: quest };

    io.to(roomId).emit(events.PROBLEM_SELECTED_INFO, payload);
    logger.info(`[Handler SelectProblemSet] Problem ${quest_id} selected in room ${roomId} by manager ${userId}. Info (raw) broadcasted.`);
  } catch (error) {
    logger.error(`[Handler SelectProblemSet] Error processing quest selection for ${quest_id} in room ${roomId}: ${error.message}`, error);
    socket.emit(events.ERROR, { message: "Failed to select problem due to a server error." });
  }
}

/**
 * 클라이언트의 문제 풀이 시작 요청(startActivity 이벤트)을 처리합니다.
 */
async function handleStartActivity(socket, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;

  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(`[Handler StartActivity] User ${userId}(${socketId}, ${username}) not in a room.`);
    socket.emit(events.ERROR, { message: "You are not in a classroom." });
    return;
  }

  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);
  if (!room) {
    logger.warn(`[Handler StartActivity] Room ${roomId} not found for user ${userId}(${socketId}, ${username}).`);
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  // 개설자 권한 확인
  if (room.managerSocketId !== socketId) {
    logger.warn(`[Handler StartActivity] User ${userId}(${socketId}, ${username}) is not the manager of room ${roomId}.`);
    socket.emit(events.ERROR, { message: "Only the manager can start the activity." });
    return;
  }

  // 이미 활동이 시작되었는지 확인
  if (room.activityStarted) {
    logger.warn(`[Handler StartActivity] Activity already started in room ${roomId}. Request by ${userId}(${socketId}, ${username}).`);
    socket.emit(events.ERROR, { message: "Activity has already started." });
    return;
  }

  // 문제가 선택되었는지 확인
  if (!room.currentQuestId || !room.currentQuestDetails) {
    logger.warn(`[Handler StartActivity] No problem selected in room ${roomId} to start activity. Request by ${userId}(${socketId}, ${username}).`);
    socket.emit(events.ERROR, { message: "A problem must be selected before starting the activity." });
    return;
  }

  // 현재 참여자 목록 가져오기
  const participants = stateManager.getUsersInClassroom(roomId);
  if (participants.length === 0) {
    logger.warn(`[Handler StartActivity] No participants in room ${roomId} to start activity. Request by ${userId}(${socketId}, ${username}).`);
    socket.emit(events.ERROR, { message: "There are no participants to start the activity with." });
    return;
  }

  // 참여자들에게 파트 번호 배정
  const assignments = participants.map((participant, index) => {
    return {
      userId: participant.userId,
      username: participant.username,
      socketId: participant.socketId,
      partNumber: index + 1, // 1부터 시작하는 파트 번호
    };
  });

  // RoomManager 상태 업데이트 (활동 시작 플래그, 파트 배정 정보 저장)
  roomManager.setActivityStateAndAssignments(roomId, true, assignments);

  // 각 참여자에게 ACTIVITY_BEGAN 이벤트 개별 전송
  assignments.forEach((assignment) => {
    const targetSocketId = assignment.socketId;
    const assignedPartNumber = assignment.partNumber;
    const questDetails = room.currentQuestDetails;

    let finalQuestContentForUser;
    let finalQuestQuestionForUser;

    if (questDetails.quest_context.is_equal == true) {
      // 공통 문제
      finalQuestContentForUser = questDetails.quest_context.player1 || questDetails.quest_context.common;
      finalQuestQuestionForUser = questDetails.quest_question;
    } else {
      // 개인 문제
      const playerKey = `player${assignedPartNumber}`;
      finalQuestContentForUser = questDetails.quest_context[playerKey];
      finalQuestQuestionForUser = questDetails.quest_question[playerKey];
    }

    // 안전장치: 만약 해당 playerKey에 대한 정보가 없다면 기본값 또는 에러 처리
    if (finalQuestContentForUser === undefined) {
      logger.warn(`[Handler StartActivity] Blockly content for ${playerKey} not found in quest ${questDetails.quest_id}. Room: ${roomId}`);
      finalQuestContentForUser = {};
    }
    if (finalQuestQuestionForUser === undefined) {
      logger.warn(`[Handler StartActivity] Question text for ${playerKey} not found in quest ${questDetails.quest_id}. Room: ${roomId}`);
      finalQuestQuestionForUser = "문제 설명을 가져올 수 없습니다.";
    }

    const payload = {
      questInfo: {
        // 공통 정보
        id: questDetails.quest_id,
        overall_description: questDetails.quest_description,
        difficulty: questDetails.quest_difficulty,
        type: questDetails.quest_type,
        is_equal: questDetails.quest_context.is_equal,

        // 참여자별 개별화된 정보
        blockly_workspace: finalQuestContentForUser,
        detailed_question: finalQuestQuestionForUser,
        default_stage: questDetails.default_stage,
      },
      myPartNumber: assignedPartNumber,
      allParticipantAssignments: assignments,
    };

    io.to(targetSocketId).emit(events.ACTIVITY_BEGIN, payload);
  });

  logger.info(`[Handler StartActivity] Activity successfully started in room ${roomId} by manager ${userId}(${socketId}, ${username}). Parts assigned and events sent to ${assignments.length} participants.`);
}

/**
 * 클라이언트의 문제 풀이 제출 요청(submitSolution 이벤트)을 처리합니다.
 */
async function handleSubmitSolution(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;

  // 입력 데이터 유효성 검사
  if (!data || data.submissionContent === undefined) {
    logger.warn(`[Handler SubmitSolution] Invalid data from ${userId}(${socketId}, ${username}). Missing submissionContent.`);
    socket.emit(events.ERROR, { message: "Submission content is missing." });
    return;
  }
  const submissionContent = data.submissionContent;

  // 사용자가 현재 유효한 방에 있는지, 활동이 시작되었는지 확인
  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(`[Handler SubmitSolution] User ${userId}(${socketId}, ${username}) not in a room.`);
    socket.emit(events.ERROR, { message: "You are not currently in a classroom." });
    return;
  }

  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);

  if (!room) {
    logger.error(`[Handler SubmitSolution] Room ${roomId} not found in RoomManager despite user ${userId}(${socketId}, ${username}) being mapped to it.`);
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  if (!room.activityStarted) {
    logger.warn(`[Handler SubmitSolution] Activity not started in room ${roomId}. Submission attempt by ${userId}(${socketId}, ${username}).`);
    socket.emit(events.ERROR, { message: "Activity has not started yet." });
    return;
  }

  // 사용자의 파트 번호 확인
  const assignment = room.participantAssignments.find((a) => a.userId === userId);
  if (!assignment) {
    logger.warn(`[Handler SubmitSolution] User ${userId}(${socketId}, ${username}) has no part assignment in room ${roomId}.`);
    socket.emit(events.ERROR, { message: "You do not have an assigned part for this activity." });
    return;
  }
  const partNumber = assignment.partNumber;

  // RoomManager를 통해 제출물 저장/업데이트
  try {
    const submissionSuccessful = roomManager.updateUserSubmission(
      roomId,
      userId,
      partNumber,
      submissionContent
    );
    logger.info(`[Handler SubmitSolution] User(${username}, Part ${partNumber}) successfully submitted solution in room ${roomId}.`);

    // 제출 성공 응답 (SUBMIT_SOLUTION_SUCCESS)
    io.to(roomId).emit(events.SUBMIT_SOLUTION_SUCCESS, {
      username: username,
      partNumber: partNumber,
      message: `${username} has submitted their solution for Part ${partNumber}.`,
    });
  } catch (error) {
    logger.error(`[Handler SubmitSolution] Failed to update submission for user ${userId}(${username}, Part ${partNumber}) in room ${roomId}: ${error.message}`);
    socket.emit(events.ERROR, {
      success: false,
      message: "Failed to save your submission. Please try again.",
    });
  }
}

/**
 * 클라이언트의 최종 제출 요청(requestFinalSubmission 이벤트)을 처리합니다.
 */
async function handleRequestFinalSubmission(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;

  // 사용자가 현재 유효한 방에 있는지 확인
  const roomId = stateManager.getRoomIdBySocketId(socketId);
  if (!roomId) {
    logger.warn(`[Handler RequestFinalSubmission] User ${userId}(${socketId}, ${username}) not in a room.`);
    socket.emit(events.ERROR, { message: "You are not currently in a classroom." });
    return;
  }

  // 방 정보 가져오기
  const roomManager = stateManager.roomManager;
  const room = roomManager.getRoom(roomId);
  if (!room) {
    logger.warn(`[Handler RequestFinalSubmission] Room ${roomId} not found for user ${userId}(${socketId}, ${username}).`);
    socket.emit(events.ERROR, { message: "Classroom session not found." });
    return;
  }

  // 개설자 권한 확인
  if (room.managerSocketId !== socketId) {
    logger.warn(`[Handler RequestFinalSubmission] User ${userId}(${socketId}, ${username}) is not the manager of room ${roomId}.`);
    socket.emit(events.ERROR, { message: "Only the manager can request final submissions." });
    return;
  }

  // RoomManager를 통해 모든 참여자의 제출물 가져오기
  const allSubmissions = roomManager.getAllSubmissionsForRoom(roomId);

  // 모든 참여자에게 FINAL_SUBMISSIONS_DATA 이벤트 브로드캐스트
  const payload = {
    finalSubmissions: allSubmissions,
  };

  io.to(roomId).emit(events.FINAL_SUBMISSIONS_DATA, payload);
  logger.info(`[Handler ReqFinalSub] Final submissions data for room ${roomId} broadcasted by manager ${userId}(${socketId}, ${username}).`);
}

/**
 * 클라이언트의 에디터 내용 변경 요청(editorContentChange 이벤트)을 처리합니다.
 */
async function handleEditorContentChange(socket, data, stateManager, io) {
  const socketId = socket.id;
  const userId = socket.userId;

  try {
    const roomId = stateManager.getRoomIdBySocketId(socketId);
    if (!roomId) {
      logger.warn(`[Handler] no roomId found for socket ${socketId}`);
      socket.emit(events.ERROR, { message: "You are not currently in a classroom." });
      return;
    }

    // 현재 방의 정보 가져오기
    const roomState = stateManager.rooms[roomId];
    if (!roomState || !roomState.classroomDetails) {
      logger.error(`[Handler] No classroom details found for room ${roomId} during editor content change.`);
      socket.emit(events.ERROR, { message: "Room details not found." });
      return;
    }

    if (!data || !data.state === undefined) {
      logger.warn(`[Handler] Invalid data received for editor content change from ${userId}(${socketId}).`);
      socket.emit(events.ERROR, { message: "Editor content is missing." });
      return;
    }

    // 자신을 제외한 다른 참여자들에게 에디터 내용 브로드캐스트
    socket.to(roomId).emit(events.EDITOR_STATE_SYNC, data);
    logger.info(`[Handler] Editor state sync broadcasted to room ${roomId} from user ${userId}(${socketId}).`);
  } catch (error) {
    logger.error(`[Handler] Error in handleEditorContentChange for socket ${socketId}: ${error.message}`, error);
    socket.emit(events.ERROR, { message: "An error occurred while changing editor content." });
  }
}

module.exports = {
  handleSelectProblemSet,
  handleStartActivity,
  handleSubmitSolution,
  handleRequestFinalSubmission,
  handleEditorContentChange
};