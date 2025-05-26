// src/socket/events.js

module.exports = {
  // 클라이언트 -> 서버
  JOIN_CLASSROOM: "joinClassroom",
  LEAVE_CLASSROOM: "leaveClassroom",
  SEND_MESSAGE: "sendMessage",
  EDITOR_CONTENT_CHANGE: "editorContentChange", // 폐기?
  // 문제 관련
  SELECT_PROBLEM_SET: "selectProblemSet", // 문제 선택
  START_ACTIVITY: "startActivity", // 문제 풀이 시작
  SUBMIT_SOLUTION: "submitSolution", // 문제 제출(개별 제출)
  REQUEST_FINAL_SUBMISSION: "requestFinalSubmission", // 최종 제출 요청
  REQUEST_END_ACTIVITY: "requestEndActivity", // 활동 종료 요청
  REQUEST_RESET_STAGE: "requestResetStage", // 스테이지 초기화 요청

  //서버 <-> 클라이언트
  REFRESH_PARTICIPANT_LIST: "refreshParticipantList",

  // 서버 -> 클라이언트
  JOIN_CLASSROOM_SUCCESS: "joinClassroomSuccess",
  USER_JOINED_CLASSROOM: "userJoinedClassroom",
  LEAVE_CLASSROOM_SUCCESS: "leaveClassroomSuccess",
  USER_LEFT_CLASSROOM: "userLeftClassroom",
  CLASSROOM_MESSAGE: "classroomMessage",
  MESSAGE_ERROR: "messageError",
  CLASSROOM_DELETED: "classroomDeleted",
  EDITOR_STATE_SYNC: "editorStateSync", // 폐기?
  // 문제 관련
  PROBLEM_SELECTED_INFO: "problemSelectedInfo", // 선택된 문제 정보 전달
  ACTIVITY_BEGIN: "activityBegin", // 문제 풀이 시작
  SUBMIT_SOLUTION_SUCCESS: "submitSolutionSuccess", // 문제 제출(개별 제출) 성공
  FINAL_SUBMISSIONS_DATA: "finalSubmissionsData", // 최종 문제 제출 데이터 전달
  ACTIVITY_ENDED: "activityEnded", // 활동 종료
  STAGE_RESET: "stageReset", // 스테이지 초기화

  // 공통/내장
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  ERROR: "error",
};
