/**
 * 연결 관련 소켓 이벤트 핸들러
 */
const logger = require("../../utils/logger");
const events = require("../events");
const Classroom = require("../../models/Classroom");

/**
 * 클라이언트 소켓 연결 해제(disconnect 이벤트)를 처리합니다.
 */
async function handleDisconnect(socket, stateManager, io, reason) {
  const socketId = socket.id;
  const userId = socket.userId;
  const username = socket.userName;
  logger.info(`[Handler] handleDisconnect called for socket: ${socketId}, User: ${userId}, Reason: ${reason}`);

  try {
    const removeResult = stateManager.removeUser(socketId);

    if (removeResult.success) {
      if (removeResult.endedClassroomDetails) {
        const endedRoom = removeResult.endedClassroomDetails;
        logger.info(`[Handler] Manager ${userId || "N/A"}(${socketId}) disconnected. Ending session for room ${endedRoom.id}.`);
        
        io.to(endedRoom.id).emit(events.CLASSROOM_DELETED, {
          classroomId: endedRoom.id,
          message: `Classroom session ended as manager (${username || userId || "Unknown"}) disconnected.`,
        });
        
        logger.info(`[Handler] Broadcasted CLASSROOM_DELETED to room ${endedRoom.id}.`);
        
        try {
          const socketsInRoom = await io.in(endedRoom.id).fetchSockets();
          socketsInRoom.forEach((sock) => {
            if (sock.id !== socketId) {
              logger.info(`[Handler] Force disconnecting socket ${sock.id} from ended room ${endedRoom.id}.`);
              sock.disconnect(true);
            }
          });
        } catch (err) {
          logger.error(`[Handler] Error fetching/disconnecting sockets in ended room ${endedRoom.id}: ${err.message}`);
        }
        
        try {
          await Classroom.delete(endedRoom.id);
          logger.info(`[Handler] Classroom ${endedRoom.id} deleted from DB due to manager disconnect.`);
        } catch (dbError) {
          logger.error(`[Handler] Failed to delete classroom ${endedRoom.id} from DB: ${dbError.message}`);
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
        
        logger.info(`[Handler] Broadcasted USER_LEFT_CLASSROOM with ${simplifiedUsers.length} users to room ${roomId} after user ${userId} disconnected.`);
      }
    } else {
      logger.warn(`[Handler] removeUser failed or user ${socketId} was not in a room during disconnect. Message: ${removeResult.message}`);
    }
  } catch (error) {
    logger.error(`[Handler] Error in handleDisconnect for socket ${socketId}: ${error.message}`, error);
  }
}

module.exports = {
  handleDisconnect
};