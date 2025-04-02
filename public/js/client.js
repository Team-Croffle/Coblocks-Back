const socket = io(); // Initialize socket.io client

// Function to join a classroom
function joinClassroom(classroomId) {
    socket.emit('JOIN_CLASSROOM', { classroomId });
}

// Function to send a message to the classroom
function sendMessage(classroomId, message) {
    socket.emit('SEND_MESSAGE', { classroomId, message });
}

// Listen for messages from the server
socket.on('MESSAGE', (data) => {
    const messageElement = document.createElement('div');
    messageElement.textContent = `${data.username}: ${data.message}`;
    document.getElementById('messages').appendChild(messageElement);
});

// Event listener for the join button
document.getElementById('joinButton').addEventListener('click', () => {
    const classroomId = document.getElementById('classroomIdInput').value;
    joinClassroom(classroomId);
});

// Event listener for the send button
document.getElementById('sendButton').addEventListener('click', () => {
    const classroomId = document.getElementById('classroomIdInput').value;
    const message = document.getElementById('messageInput').value;
    sendMessage(classroomId, message);
    document.getElementById('messageInput').value = ''; // Clear input field
});