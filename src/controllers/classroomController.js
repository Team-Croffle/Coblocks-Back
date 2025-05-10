const Classroom = require("../models/Classroom");
const { getStateManager, getIo } = require("../socket/setup");
const logger = require("../utils/logger");
const events = require("../socket/events");

const createClassroom = async (req, res) => {
  try {
    const manager_users_id = req.user.id; // JWT에서 사용자 ID 가져오기
    const { classroom_name } = req.body;

    if (!classroom_name) {
      logger.warn(
        "Create classroom request missing required fields:",
        req.body
      );
      return res.status(400).json({
        success: false,
        message: "classroom_name are required.",
      });
    }

    const newClassroom = await Classroom.create(
      manager_users_id,
      classroom_name
    );

    res.status(201).json({
      success: true,
      message: "Classroom created successfully.",
      classroom: newClassroom,
    });
  } catch (error) {
    logger.error(
      `Error in createClassroom controller: ${error.message}`,
      error
    );
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create classroom.",
    });
  }
};

const joinClassroomByCode = async (req, res) => {
  try {
    const userId = req.user.id; // JWT에서 사용자 ID 가져오기
    const { code } = req.body;

    // 1. 입력 값 유효성 검사
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Classroom code is required.",
      });
    }
    // 2. 코드로 강의실 정보 조회 (DB)
    const classroom = await Classroom.findByCode(code);

    if (!classroom) {
      return res.status(404).json({
        success: false,
        message: "Invalid classroom code.", // 코드 불일치
      });
    }
    // 3. 강의실 세션 활성 상태 확인 (실시간 상태 관리자 사용)
    const stateManager = getStateManager(); // StateManager 인스턴스 가져오기
    if (!stateManager) {
      // StateManager 인스턴스를 가져올 수 없는 경우 (서버 설정 오류)
      logger.error(
        "[Controller] Failed to get StateManager instance in joinClassroomByCode."
      );
      return res
        .status(500)
        .json({ success: false, message: "Server configuration error." });
    }
    const classroomId = classroom.classroom_id; // DB에서 찾은 강의실 ID

    if (!stateManager.isClassroomActive(classroomId)) {
      // 해당 강의실 세션이 활성 상태가 아님 (개설자가 접속 중이 아님)
      logger.warn(
        `Join attempt failed for inactive classroom ${code} (${classroomId}) by user ${userId}`
      );
      return res.status(403).json({
        // 403 Forbidden: 권한 없음 (참여할 수 없는 상태)
        success: false,
        message: "Classroom session is not currently active.", // 세션 비활성
      });
    }

    // 4. 유효성 검사 통과: 성공 응답 (강의실 정보 포함)
    logger.info(
      `User ${userId} successfully validated join code for classroom ${code} (${classroomId})`
    );
    res.status(200).json({
      success: true,
      message:
        "Classroom code is valid and session is active. Proceed to connect socket.",
      classroom: classroom, // DB에서 조회한 강의실 상세 정보 전달
    });
  } catch (error) {
    logger.error(
      `Error during joinClassroomByCode for code ${req.body?.code}: ${error.message}`,
      error
    );
    res.status(500).json({
      success: false,
      message: "Failed to process join request.",
      error: error.message,
    });
  }
};

const deleteClassroom = async (req, res) => {
  const { classroom_code } = req.params;
  const userId = req.user.id; // JWT에서 사용자 ID 가져오기

  logger.info(
    `Receved request to delete classroom: ${classroom_code} by ${userId}`
  );

  try {
    if (!classroom_code) {
      return res.status(400).json({
        success: false,
        message: "classroom_code is required.",
      });
    }

    const classroom = await Classroom.findByCode(classroom_code);
    if (!classroom) {
      return res.status(404).json({
        success: false,
        message: "Classroom not found with this code.",
      });
    }
    const classroomId = classroom.classroom_id;
    const managerId = classroom.manager_users_id;

    if (userId !== managerId) {
      logger.warn(
        `User ${userId} attempted to delete classroom ${classroom_code} owned by ${managerId}. Forbidden.`
      );
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this classroom.",
      });
    }

    const stateManager = getStateManager();
    const io = getIo();

    if (!stateManager || !io) {
      logger.error(
        "[Controller] StateManager or IO instance not available for delete operation."
      );
      return res.status(500).json({
        success: false,
        message: "Server configuration error.",
      });
    }

    stateManager.endClassroomSession(classroomId);
    logger.info(
      `[Controller] Cleared in-memory state for classroom ${classroomId}.`
    );

    io.to(classroomId).emit(events.CLASSROOM_DELETED, {
      classroomId: classroomId,
      message: `Classroom (${classroom_code}) was deleted by the manager.`,
    });
    logger.info(
      `[Controller] Broadcasted CLASSROOM_DELETED to room ${classroomId}.`
    );

    try {
      await io.in(classroomId).disconnectSockets(true); // 해당 룸의 모든 소켓 연결 강제 해제
      logger.info(
        `[Controller] Force disconnected sockets in room ${classroomId}.`
      );
    } catch (disconnectErr) {
      logger.error(
        `[Controller] Error force disconnecting sockets in room ${classroomId}: ${disconnectErr.message}`
      );
      // 연결 해제 실패는 계속 진행 가능
    }

    logger.info(
      `[Controller] Attempting to delete classroom ${classroomId} from database.`
    );
    const deleted = await Classroom.delete(classroomId); // classroomId 사용

    if (!deleted) {
      // 모델에서 false를 반환했거나 (0 rows affected), 오류가 발생하지 않았지만 삭제 안됨
      // handleDisconnect의 로그와 유사하게 처리 (실패 가능성 있음)
      logger.warn(
        `[Controller] Classroom.delete reported no rows deleted for ${classroomId}. Check RLS/DB state.`
      );
      // 성공으로 간주하고 넘어갈지, 오류로 처리할지 결정 필요
      // 여기서는 일단 성공으로 간주하고 204 응답
    } else {
      logger.info(
        `[Controller] Classroom ${classroomId} successfully deleted from database.`
      );
    }

    res.status(204).send();
  } catch (error) {
    // <<<--- [수정] 오류 로깅 강화 및 클라이언트 응답 단순화 ---<<<
    logger.error(
      `!!! Error during deleteClassroom function for code ${classroom_code} !!!`
    );
    // 전체 오류 객체를 로깅하여 스택 트레이스 등 확인
    logger.error("Caught Error Object:", error);
    // 오류 메시지만 따로 로깅
    logger.error("Caught Error Message:", error?.message); // Optional chaining

    // 클라이언트에게는 상세 오류 메시지 대신 일반적인 메시지 전달
    res.status(500).json({
      success: false,
      message: "Failed to delete classroom due to server error.",
      // error: error.message // 상세 오류는 클라이언트에 노출하지 않는 것이 좋음
    });
  }
};

const leaveClassroom = async (req, res) => {
  const { classroom_code } = req.params; // URL 경로에서 코드 추출
  const userId = req.user.id; // 요청 보낸 사용자 ID는 인증된 정보 사용

  logger.info(
    `Received API request to leave classroom ${classroom_code} by user ${userId}`
  );

  try {
    // 1. 입력 값 유효성 검사 (코드와 userId 존재 여부)
    if (!classroom_code) {
      return res.status(400).json({
        success: false,
        message: "Classroom code is required.",
      });
    }

    // 2. 코드로 강의실 정보 조회 (DB)
    const classroom = await Classroom.findByCode(classroom_code);
    if (!classroom) {
      return res.status(404).json({
        success: false,
        message: "Classroom not found with this code.",
      });
    }
    const classroomId = classroom.classroom_id;

    // 3. 상태 관리자 및 IO 인스턴스 가져오기
    const stateManager = getStateManager();
    const io = getIo();
    if (!stateManager || !io) {
      logger.error(
        "[Controller] StateManager or IO instance not available for leave operation."
      );
      return res
        .status(500)
        .json({ success: false, message: "Server configuration error." });
    }

    // 4. 상태 관리자에서 사용자 제거 시도 (socketId 찾기 필요)
    //    userId와 classroomId로 해당 방에서 사용자의 socketId 찾기
    const usersInRoom = stateManager.getUsersInClassroom(classroomId);
    const userSocketEntry = usersInRoom.find((user) => user.userId === userId);

    if (!userSocketEntry) {
      // 사용자가 해당 방의 실시간 상태에 없음 (이미 나갔거나, 잘못된 요청)
      logger.warn(
        `User ${userId} tried to leave room ${classroomId} via API, but not found in state.`
      );
      // 이미 나간 상태일 수 있으므로 성공으로 처리하거나, 오류로 처리할 수 있음
      // 여기서는 성공(이미 나감)으로 간주하고 200 OK 응답
      return res.status(200).json({
        success: true,
        message: "User already left or was not in the classroom.",
      });
    }

    const socketId = userSocketEntry.socketId;
    const username = userSocketEntry.username; // 필요시 사용

    // 5. SocketStateManager를 통해 사용자 제거 및 결과 확인
    const removeResult = stateManager.removeUser(socketId, classroomId);

    // 6. 결과에 따른 후속 처리 (DB 삭제, 이벤트 발송 등)
    if (removeResult.success) {
      if (removeResult.endedClassroomDetails) {
        // 나간 사용자가 개설자였음 -> 세션 종료 처리
        const endedRoom = removeResult.endedClassroomDetails;
        logger.info(
          `[Controller API] Manager ${userId}(${socketId}) left via API. Ending session for room ${endedRoom.id}.`
        );

        // 남은 사용자들에게 방 삭제 알림 발송
        io.to(endedRoom.id).emit(events.CLASSROOM_DELETED, {
          classroomId: endedRoom.id,
          message: `Classroom session ended as manager (${
            username || userId || "Unknown"
          }) left.`,
        });
        logger.info(
          `[Controller API] Broadcasted CLASSROOM_DELETED to room ${endedRoom.id}.`
        );

        // 남은 사용자들 강제 연결 해제 시도
        try {
          await io.in(endedRoom.id).disconnectSockets(true);
          logger.info(
            `[Controller API] Force disconnected sockets in room ${endedRoom.id}.`
          );
        } catch (disconnectErr) {
          logger.error(
            `[Controller API] Error force disconnecting sockets: ${disconnectErr.message}`
          );
        }

        // 데이터베이스에서 강의실 삭제 (안전한 방식 필요 - 현재 RLS 정책에 따라 결과 달라짐)
        try {
          logger.info(
            `[Controller API] Attempting to delete classroom ${endedRoom.id} from database.`
          );
          await Classroom.delete(endedRoom.id);
          logger.info(
            `[Controller API] Classroom ${endedRoom.id} deletion attempted from DB due to manager leaving via API.`
          );
          // 실제 삭제 성공 여부는 모델 로그 또는 DB 확인 필요
        } catch (dbError) {
          logger.error(
            `[Controller API] Failed to delete classroom ${endedRoom.id} from DB: ${dbError.message}`
          );
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
          userId: userId,
          username: username,
          users: simplifiedUsers,
        });
        logger.info(
          `[Controller API] Broadcasted USER_LEFT_CLASSROOM with ${simplifiedUsers.length} users to room ${roomId} after user ${userId} left via API.`
        );
      }
      // 성공 응답 (200 OK)
      res
        .status(200)
        .json({ success: true, message: "Successfully left the classroom." });
    } else {
      // removeUser 자체가 실패한 경우 (거의 발생 안 함)
      logger.error(
        `[Controller API] stateManager.removeUser failed unexpectedly for socket ${socketId}. Message: ${removeResult.message}`
      );
      res
        .status(500)
        .json({ success: false, message: "Failed to update server state." });
    }
  } catch (error) {
    logger.error(
      `Error during leaveClassroomAPI for code ${classroom_code}: ${error.message}`,
      error
    );
    res.status(500).json({
      success: false,
      message: "Failed to process leave request.",
      error: error.message,
    });
  }
};

module.exports = {
  createClassroom,
  joinClassroomByCode,
  deleteClassroom,
  leaveClassroom,
};
