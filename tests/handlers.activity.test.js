const { handleStartActivity, handleSubmitSolution, handleRequestFinalSubmission } = require("../src/socket/handlers/activity-handlers");
const logger = require("../src/utils/logger");
const events = require("../src/socket/events");

// 모킹 설정
jest.mock("../src/utils/logger");

describe("문제풀이 관련 핸들러 테스트", () => {
  // 테스트에 필요한 Mock 객체 및 변수들
  let socket;
  let stateManager;
  let io;
  let roomId = "room-123";
  let socketId = "socket-123";
  let userId = "user-123";
  let userName = "TestUser";

  beforeEach(() => {
    // 각 테스트 전에 모든 목(mock) 초기화
    jest.clearAllMocks();

    // Socket 목 설정
    socket = {
      id: socketId,
      userId: userId,
      userName: userName,
      emit: jest.fn(),
    };

    // io 목 설정
    io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  describe("handleStartActivity 테스트", () => {
    beforeEach(() => {
      // stateManager 목 설정 - 활동 시작 테스트용
      stateManager = {
        getRoomIdBySocketId: jest.fn().mockReturnValue(roomId),
        getUsersInClassroom: jest.fn().mockReturnValue([
          { userId: "user-123", username: "TestUser", socketId: "socket-123" },
          { userId: "user-456", username: "User2", socketId: "socket-456" }
        ]),
        roomManager: {
          getRoom: jest.fn().mockReturnValue({
            managerSocketId: socketId,
            activityStarted: false,
            currentQuestId: "quest-123",
            currentQuestDetails: {
              quest_id: "quest-123",
              quest_description: "테스트 문제",
              quest_difficulty: "easy",
              quest_type: "collaborative",
              quest_context: {
                is_equal: true,
                player1: { blocks: [] },
                common: { blocks: [] }
              },
              quest_question: "문제를 풀어보세요",
              default_stage: {}
            }
          }),
          setActivityStateAndAssignments: jest.fn()
        }
      };
    });

    test("활동 시작 성공 케이스", async () => {
      // 실행
      await handleStartActivity(socket, stateManager, io);

      // 검증
      expect(stateManager.getRoomIdBySocketId).toHaveBeenCalledWith(socketId);
      expect(stateManager.roomManager.getRoom).toHaveBeenCalledWith(roomId);
      expect(stateManager.getUsersInClassroom).toHaveBeenCalledWith(roomId);
      expect(stateManager.roomManager.setActivityStateAndAssignments).toHaveBeenCalledWith(
        roomId, 
        true, 
        expect.arrayContaining([
          expect.objectContaining({ userId: "user-123", partNumber: 1 }),
          expect.objectContaining({ userId: "user-456", partNumber: 2 })
        ])
      );
      expect(io.to).toHaveBeenCalledTimes(2); // 각 참가자에게 한 번씩
      expect(io.emit).toHaveBeenCalledWith(
        events.ACTIVITY_BEGIN,
        expect.objectContaining({
          questInfo: expect.any(Object),
          myPartNumber: expect.any(Number)
        })
      );
    });

    test("사용자가 방에 없는 경우 에러 처리", async () => {
      // 설정
      stateManager.getRoomIdBySocketId.mockReturnValue(null);

      // 실행
      await handleStartActivity(socket, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "You are not in a classroom."
      });
      expect(stateManager.roomManager.setActivityStateAndAssignments).not.toHaveBeenCalled();
    });

    test("사용자가 방의 관리자가 아닌 경우 에러 처리", async () => {
      // 설정
      stateManager.roomManager.getRoom.mockReturnValue({
        managerSocketId: "different-socket-id",
        activityStarted: false,
        currentQuestId: "quest-123"
      });

      // 실행
      await handleStartActivity(socket, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "Only the manager can start the activity."
      });
      expect(stateManager.roomManager.setActivityStateAndAssignments).not.toHaveBeenCalled();
    });

    test("이미 활동이 시작된 경우 에러 처리", async () => {
      // 설정
      stateManager.roomManager.getRoom.mockReturnValue({
        managerSocketId: socketId,
        activityStarted: true,
        currentQuestId: "quest-123"
      });

      // 실행
      await handleStartActivity(socket, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "Activity has already started."
      });
      expect(stateManager.roomManager.setActivityStateAndAssignments).not.toHaveBeenCalled();
    });

    test("문제가 선택되지 않은 경우 에러 처리", async () => {
      // 설정
      stateManager.roomManager.getRoom.mockReturnValue({
        managerSocketId: socketId,
        activityStarted: false,
        currentQuestId: null
      });

      // 실행
      await handleStartActivity(socket, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "A problem must be selected before starting the activity."
      });
      expect(stateManager.roomManager.setActivityStateAndAssignments).not.toHaveBeenCalled();
    });

    test("참가자가 없는 경우 에러 처리", async () => {
      // 설정
      stateManager.getUsersInClassroom.mockReturnValue([]);

      // 실행
      await handleStartActivity(socket, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "There are no participants to start the activity with."
      });
      expect(stateManager.roomManager.setActivityStateAndAssignments).not.toHaveBeenCalled();
    });
  });

  describe("handleSubmitSolution 테스트", () => {
    let submissionData;

    beforeEach(() => {
      // 제출 데이터 설정
      submissionData = {
        submissionContent: { blocks: ["test-block-1", "test-block-2"] }
      };

      // stateManager 목 설정 - 제출 테스트용
      stateManager = {
        getRoomIdBySocketId: jest.fn().mockReturnValue(roomId),
        roomManager: {
          getRoom: jest.fn().mockReturnValue({
            activityStarted: true,
            participantAssignments: [
              { userId: userId, partNumber: 1 }
            ]
          }),
          updateUserSubmission: jest.fn().mockReturnValue(true)
        }
      };
    });

    test("제출 성공 케이스", async () => {
      // 실행
      await handleSubmitSolution(socket, submissionData, stateManager, io);

      // 검증
      expect(stateManager.getRoomIdBySocketId).toHaveBeenCalledWith(socketId);
      expect(stateManager.roomManager.getRoom).toHaveBeenCalledWith(roomId);
      expect(stateManager.roomManager.updateUserSubmission).toHaveBeenCalledWith(
        roomId,
        userId,
        1, // partNumber
        submissionData.submissionContent
      );
      expect(io.to).toHaveBeenCalledWith(roomId);
      expect(io.emit).toHaveBeenCalledWith(
        events.SUBMIT_SOLUTION_SUCCESS,
        expect.objectContaining({
          username: userName,
          partNumber: 1
        })
      );
    });

    test("제출 데이터가 없는 경우 에러 처리", async () => {
      // 설정
      const invalidData = {};

      // 실행
      await handleSubmitSolution(socket, invalidData, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "Submission content is missing."
      });
      expect(stateManager.roomManager.updateUserSubmission).not.toHaveBeenCalled();
    });

    test("사용자가 방에 없는 경우 에러 처리", async () => {
      // 설정
      stateManager.getRoomIdBySocketId.mockReturnValue(null);

      // 실행
      await handleSubmitSolution(socket, submissionData, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "You are not currently in a classroom."
      });
      expect(stateManager.roomManager.updateUserSubmission).not.toHaveBeenCalled();
    });

    test("활동이 시작되지 않은 경우 에러 처리", async () => {
      // 설정
      stateManager.roomManager.getRoom.mockReturnValue({
        activityStarted: false,
        participantAssignments: []
      });

      // 실행
      await handleSubmitSolution(socket, submissionData, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "Activity has not started yet."
      });
      expect(stateManager.roomManager.updateUserSubmission).not.toHaveBeenCalled();
    });

    test("사용자에게 파트가 할당되지 않은 경우 에러 처리", async () => {
      // 설정
      stateManager.roomManager.getRoom.mockReturnValue({
        activityStarted: true,
        participantAssignments: [
          { userId: "different-user", partNumber: 1 }
        ]
      });

      // 실행
      await handleSubmitSolution(socket, submissionData, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "You do not have an assigned part for this activity."
      });
      expect(stateManager.roomManager.updateUserSubmission).not.toHaveBeenCalled();
    });

    test("제출 저장 실패 시 에러 처리", async () => {
      // 설정
      stateManager.roomManager.updateUserSubmission.mockImplementation(() => {
        throw new Error("저장 실패");
      });

      // 실행
      await handleSubmitSolution(socket, submissionData, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        success: false,
        message: "Failed to save your submission. Please try again."
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("handleRequestFinalSubmission 테스트", () => {
    beforeEach(() => {
      // stateManager 목 설정 - 최종 제출 요청 테스트용
      stateManager = {
        getRoomIdBySocketId: jest.fn().mockReturnValue(roomId),
        roomManager: {
          getRoom: jest.fn().mockReturnValue({
            managerSocketId: socketId
          }),
          getAllSubmissionsForRoom: jest.fn().mockReturnValue({
            "user-123": { partNumber: 1, content: { blocks: [] } },
            "user-456": { partNumber: 2, content: { blocks: [] } }
          })
        }
      };
    });

    test("최종 제출 요청 성공 케이스", async () => {
      // 실행
      await handleRequestFinalSubmission(socket, {}, stateManager, io);

      // 검증
      expect(stateManager.getRoomIdBySocketId).toHaveBeenCalledWith(socketId);
      expect(stateManager.roomManager.getRoom).toHaveBeenCalledWith(roomId);
      expect(stateManager.roomManager.getAllSubmissionsForRoom).toHaveBeenCalledWith(roomId);
      expect(io.to).toHaveBeenCalledWith(roomId);
      expect(io.emit).toHaveBeenCalledWith(
        events.FINAL_SUBMISSIONS_DATA,
        expect.objectContaining({
          finalSubmissions: expect.any(Object)
        })
      );
    });

    test("사용자가 방에 없는 경우 에러 처리", async () => {
      // 설정
      stateManager.getRoomIdBySocketId.mockReturnValue(null);

      // 실행
      await handleRequestFinalSubmission(socket, {}, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "You are not currently in a classroom."
      });
      expect(stateManager.roomManager.getAllSubmissionsForRoom).not.toHaveBeenCalled();
    });

    test("사용자가 방의 관리자가 아닌 경우 에러 처리", async () => {
      // 설정
      stateManager.roomManager.getRoom.mockReturnValue({
        managerSocketId: "different-socket-id"
      });

      // 실행
      await handleRequestFinalSubmission(socket, {}, stateManager, io);

      // 검증
      expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
        message: "Only the manager can request final submissions."
      });
      expect(stateManager.roomManager.getAllSubmissionsForRoom).not.toHaveBeenCalled();
    });
  });
});