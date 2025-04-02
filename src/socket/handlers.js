const events = require('./events');

const classroomUsers = {};

const handleJoinClassroom = (socket, classroomId, userId) => {
    if (!classroomUsers[classroomId]) {
        classroomUsers[classroomId] = new Set();
    }
    classroomUsers[classroomId].add(userId);
    socket.join(classroomId);
    socket.to(classroomId).emit('userJoined', userId);
};

const handleLeaveClassroom = (socket, classroomId, userId) => {
    if (classroomUsers[classroomId]) {
        classroomUsers[classroomId].delete(userId);
        socket.leave(classroomId);
        socket.to(classroomId).emit('userLeft', userId);
    }
};

const handleSendMessage = (socket, classroomId, message) => {
    socket.to(classroomId).emit('message', message);
};

module.exports = {
    handleJoinClassroom,
    handleLeaveClassroom,
    handleSendMessage,
};