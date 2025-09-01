export const events = {
  // Client >>>> Server
  // 강의실
  CLASSROOM_CREATE: 'classroom:create', // 방 개설
  CLASSROOM_JOIN: 'classroom:join', // 방 참여
  CLASSROOM_LEAVE: 'classroom:leave', // 방 퇴장

  // 채팅
  CHAT_SEND_MESSAGE: 'chat:sendMessage', // 메시지 전송

  // 문제풀이 활동
  ACTIVITY_SELECT_PROBLEM: 'activity:selectProblem', // 문제 선택
  ACTIVITY_START: 'activity:start', // 활동 시작
  ACTIVITY_SUBMIT_SOLUTION: 'activity:submitSolution', // 문제 제출(개인)
  ACTIVITY_FINAL_SUBMIT: 'activity:finalSubmit', // 최종 제출 요청(방장)
  ACTIVITY_END: 'activity:end', // 활동 종료

  // Server >>>> Client
  // 강의실
  CLASSROOM_USER_JOINED: 'classroom:userJoined', // 방 참여 알림
  CLASSROOM_USER_LEFT: 'classroom:userLeft', // 방 퇴장 알림
  CLASSROOM_DELETED: 'classroom:deleted', // 방 삭제 알림

  // 채팅
  CHAT_MESSAGE: 'chat:message', // 메시지 수신

  // 문제풀이 활동
  ACTIVITY_PROBLEM_SELECTED: 'activity:problemSelected', // 문제 선택 알림
  ACTIVITY_BEGIN: 'activity:begin', // 활동 시작 알림
  ACTIVITY_SUBMITTED: 'activity:submitted', // 문제 제출 알림
  ACTIVITY_FINAL_SUBMITTED: 'activity:finalSubmitted', // 최종 제출 알림
  ACTIVITY_ENDED: 'activity:ended', // 활동 종료 알림
};
