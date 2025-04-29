const Classroom = require("../models/Classroom");
const { getStateManager } = require("../socket/setup");
const logger = require("../utils/logger");

const createClassroom = async (req, res) => {
  try {
    const { manager_users_id, classroom_name } = req.body;

    if (!manager_users_id || !classroom_name) {
      logger.warn(
        "Create classroom request missing required fields:",
        req.body
      );
      return res.status(400).json({
        success: false,
        message: "manager_users_id and classroom_name are required.",
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
    console.error("Error in createClassroom controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create classroom.",
    });
  }
};

const joinClassroomByCode = async (req, res) => {
  try {
    const { code, userId } = req.body;

    // 1. 입력 값 유효성 검사
    if (!code || !userId) {
      return res.status(400).json({
        success: false,
        message: "Classroom code and userId are required.",
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

module.exports = {
  createClassroom,
  joinClassroomByCode,
};
