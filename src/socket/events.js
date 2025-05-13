// src/socket/events.js

module.exports = {
  // 클라이언트 -> 서버
  JOIN_CLASSROOM: "joinClassroom",
  LEAVE_CLASSROOM: "leaveClassroom",
  SEND_MESSAGE: "sendMessage",
  EDITOR_CONTENT_CHANGE: "editorContentChange",

  REFRESH_PARTICIPANT_LIST: "refreshParticipantList",

  // 서버 -> 클라이언트
  JOIN_CLASSROOM_SUCCESS: "joinClassroomSuccess",
  USER_JOINED_CLASSROOM: "userJoinedClassroom",
  LEAVE_CLASSROOM_SUCCESS: "leaveClassroomSuccess",
  USER_LEFT_CLASSROOM: "userLeftClassroom",
  CLASSROOM_MESSAGE: "classroomMessage",
  MESSAGE_ERROR: "messageError",
  CLASSROOM_DELETED: "classroomDeleted",
  EDITOR_STATE_SYNC: "editorStateSync",

  // 공통/내장
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  ERROR: "error",
};
