/**
 * Socket 이벤트 핸들러 모듈
 * 각 기능별로 분리된 핸들러 파일들을 통합하여 내보냅니다.
 */

const classroomHandlers = require('./classroom-handlers');
const activityHandlers = require('./activity-handlers');
const messageHandlers = require('./message-handlers');
const connectionHandlers = require('./connection-handlers');

module.exports = {
  // 강의실 관련 핸들러
  handleJoinClassroom: classroomHandlers.handleJoinClassroom,
  handleLeaveClassroom: classroomHandlers.handleLeaveClassroom,
  handleRefreshParticipantList: classroomHandlers.handleRefreshParticipantList,
  
  // 활동 관련 핸들러
  handleSelectProblemSet: activityHandlers.handleSelectProblemSet,
  handleStartActivity: activityHandlers.handleStartActivity,
  handleSubmitSolution: activityHandlers.handleSubmitSolution,
  handleRequestFinalSubmission: activityHandlers.handleRequestFinalSubmission,
  handleEditorContentChange: activityHandlers.handleEditorContentChange,
  handleEndActivity: activityHandlers.handleEndActivity,
  
  // 메시지 관련 핸들러
  handleSendMessage: messageHandlers.handleSendMessage,
  
  // 연결 관련 핸들러
  handleDisconnect: connectionHandlers.handleDisconnect
};