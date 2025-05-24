const { handleSelectProblemSet } = require("../src/socket/handlers/activity-handlers");
const Quest = require("../src/models/Quest");
const logger = require("../src/utils/logger");
const events = require("../src/socket/events");

// 모킹 설정
jest.mock("../src/models/Quest");
jest.mock("../src/utils/logger");

describe("handleSelectProblemSet", () => {
  // 테스트에 필요한 Mock 객체 및 변수들
  let socket;
  let data;
  let stateManager;
  let io;
  let roomId = "room-123";
  let socketId = "socket-123";
  let userId = "user-123";
  let questId = "quest-123";

  beforeEach(() => {
    // 각 테스트 전에 모든 목(mock) 초기화
    jest.clearAllMocks();

    // Socket 목 설정
    socket = {
      id: socketId,
      userId: userId,
      emit: jest.fn(),
    };

    // 데이터 목 설정
    data = {
      quest_id: questId,
    };

    // stateManager 목 설정
    stateManager = {
      getRoomIdBySocketId: jest.fn().mockReturnValue(roomId),
      roomManager: {
        getRoom: jest.fn().mockReturnValue({
          managerSocketId: socketId,
          // 기타 방 정보...
        }),
        setSelectedQuest: jest.fn(),
      },
    };

    // io 목 설정
    io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    // Quest.findQuestById 모킹 - 기본값은 성공 케이스
    Quest.findQuestById = jest.fn().mockResolvedValue({
      quest_id: questId,
      title: "테스트 문제",
      // 기타 퀘스트 정보...
    });
  });

  test("퀘스트 선택 성공 케이스 - 정상 처리", async () => {
    // 실행
    await handleSelectProblemSet(socket, data, stateManager, io);

    // 검증
    expect(stateManager.getRoomIdBySocketId).toHaveBeenCalledWith(socketId);
    expect(stateManager.roomManager.getRoom).toHaveBeenCalledWith(roomId);
    expect(Quest.findQuestById).toHaveBeenCalledWith(questId);
    expect(stateManager.roomManager.setSelectedQuest).toHaveBeenCalled();
    expect(io.to).toHaveBeenCalledWith(roomId);
    expect(io.emit).toHaveBeenCalledWith(
      events.PROBLEM_SELECTED_INFO,
      expect.any(Object)
    );
    expect(socket.emit).not.toHaveBeenCalled();
  });

  test("quest_id가 없는 경우 에러 처리", async () => {
    // 설정
    data.quest_id = undefined;

    // 실행
    await handleSelectProblemSet(socket, data, stateManager, io);

    // 검증
    expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
      message: "Quest ID is required.",
    });
    expect(Quest.findQuestById).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  test("사용자가 방에 없는 경우 에러 처리", async () => {
    // 설정
    stateManager.getRoomIdBySocketId.mockReturnValue(null);

    // 실행
    await handleSelectProblemSet(socket, data, stateManager, io);

    // 검증
    expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
      message: "You are not currently in a classroom.",
    });
    expect(Quest.findQuestById).not.toHaveBeenCalled();
  });

  test("사용자가 방의 관리자가 아닌 경우 에러 처리", async () => {
    // 설정
    stateManager.roomManager.getRoom.mockReturnValue({
      managerSocketId: "different-socket-id", // 다른 사람이 관리자
    });

    // 실행
    await handleSelectProblemSet(socket, data, stateManager, io);

    // 검증
    expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
      message: "Only the manager can select a problem.",
    });
    expect(Quest.findQuestById).not.toHaveBeenCalled();
  });

  test("존재하지 않는 Quest ID인 경우 에러 처리", async () => {
    // 설정
    Quest.findQuestById.mockResolvedValue(null);

    // 실행
    await handleSelectProblemSet(socket, data, stateManager, io);

    // 검증
    expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
      message: "Quest not found.",
    });
    expect(stateManager.roomManager.setSelectedQuest).not.toHaveBeenCalled();
  });

  test("Quest 조회 중 에러 발생 시 에러 처리", async () => {
    // 설정
    Quest.findQuestById.mockRejectedValue(new Error("DB 조회 오류"));

    // 실행
    await handleSelectProblemSet(socket, data, stateManager, io);

    // 검증
    expect(socket.emit).toHaveBeenCalledWith(events.ERROR, {
      message: "Failed to select problem due to a server error.",
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
