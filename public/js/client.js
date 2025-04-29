// public/js/client.js (진짜! 최종 완전본 - 생략 없음)

const BACKEND_URL = "http://localhost:3000";

let socket = null; // 소켓 인스턴스 변수
let currentClassroomId = null;
let currentClassroomInfo = null; // 현재 참여한 강의실 정보

// UI 요소들에 대한 변수 선언
let userIdInput,
  userNameInput,
  managerIdInput,
  classroomInput,
  createClassroomBtn;
let joinCodeInput, joinClassroomBtn;
let chatContainer, classroomInfoDiv, leaveClassroomBtn, deleteClassroomBtn;
let messagesDiv, messageInput, sendMessageBtn;
let participantsList, participantCount;
let responseArea;

/**
 * Socket.IO 이벤트 리스너들을 설정하는 함수
 * @param {object} socketInstance - 연결된 소켓 인스턴스
 */
function setupSocketListeners(socketInstance) {
  if (!socketInstance) return;
  console.log(`Setting up listeners for socket: ${socketInstance.id}`);

  // 기본 이벤트 리스너
  socketInstance.on("connect", () => {
    console.log(`Socket connected: ${socketInstance.id}`);
    if (
      currentClassroomInfo &&
      currentClassroomId === currentClassroomInfo.classroom_id
    ) {
      console.log(
        `>>> Auto Emitting joinClassroom for ${currentClassroomId} after connect`
      );
      socketInstance.emit("joinClassroom", {
        classroomDetails: currentClassroomInfo,
      });
    } else {
      console.log(
        "Socket connected, but no specific room to join immediately."
      );
    }
  });

  socketInstance.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socketInstance.id}, Reason: ${reason}`);
    alert(`서버 연결 끊김: ${reason}`);
    hideChatContainer();
    socket = null; // 소켓 변수 초기화
  });

  socketInstance.on("error", (err) => {
    console.error("Socket error:", err);
    alert(`Socket 오류: ${err.message || err}`);
  });

  socketInstance.on("userJoinedClassroom", (data) => {
    // data 객체는 { userId: '참여한사람ID', username: '참여한사람이름', users: [갱신된 전체 목록] } 형태를 기대
    console.log("Received userJoinedClassroom:", data); // 이벤트 및 데이터 확인 로그
    if (data && data.users) {
      // 전달받은 최신 전체 사용자 목록으로 UI 업데이트
      updateParticipantsList(data.users); // 참여자 목록 업데이트 함수 호출

      // (선택사항) 채팅창에 시스템 메시지 표시
      const joiningUserName = data.username || data.userId || "Someone";
      // 채팅 메시지 표시 함수 재활용
      displayChatMessage({
        username: "System",
        message: `${joiningUserName}님이 입장했습니다.`,
      });
    } else {
      // 예상치 못한 데이터 형식일 경우 경고 로그
      console.warn(
        "Received userJoinedClassroom event without valid users data:",
        data
      );
      // 필요하다면 여기서 사용자 목록 API를 다시 호출하여 동기화할 수도 있음
    }
  });

  socketInstance.on("userLeftClassroom", (data) => {
    // data 객체는 { userId: '나간사람ID', username: '나간사람이름', users: [갱신된 전체 목록] } 형태를 기대
    console.log("Received userLeftClassroom:", data);
    if (data && data.users) {
      // 전달받은 최신 전체 사용자 목록으로 UI 업데이트
      updateParticipantsList(data.users); // 참여자 목록 업데이트 함수 호출

      // (선택사항) 채팅창에 시스템 메시지 표시
      const leavingUserName = data.username || data.userId || "Someone";
      displayChatMessage({
        username: "System",
        message: `${leavingUserName}님이 퇴장했습니다.`,
      });
    } else {
      console.warn(
        "Received userLeftClassroom event without valid users data:",
        data
      );
      // 필요하다면 여기서 사용자 목록 API를 다시 호출할 수도 있음
    }
  });

  socketInstance.on("classroomDeleted", (data) => {
    // data 객체는 { classroomId: '삭제된ID', message: '삭제사유 메시지' } 형태를 기대
    console.log("Received classroomDeleted:", data);
    logSocketEvent("classroomDeleted", data); // 필요시 로그 함수 사용

    // 현재 내가 접속해 있던 방이 삭제된 경우에만 처리
    if (currentClassroomId === data.classroomId) {
      alert(
        data.message ||
          `참여 중인 강의실(ID: ${data.classroomId})이 삭제되었습니다.`
      );
      // 채팅 UI 숨김 및 관련 상태 초기화
      hideChatContainer();
    } else {
      // 내가 접속 중인 방이 아닌 다른 방이 삭제된 알림일 경우 (일반적으로 발생하지 않음)
      console.warn(
        `Received classroomDeleted event for a room (${data.classroomId}) I wasn't in? Current room: ${currentClassroomId}`
      );
    }
  });

  // 강의실/채팅 관련 이벤트 리스너
  socketInstance.on("classroomMessage", (data) => {
    displayChatMessage(data);
  });

  socketInstance.on("joinClassroomSuccess", (response) => {
    console.log("Received joinClassroomSuccess:", response);
    if (response.success && response.users) {
      updateParticipantsList(response.users);
      console.log(
        `Successfully joined room ${response.classroom?.classroom_code}. Manager: ${response.isManager}`
      );
    } else {
      console.error("Failed to join classroom via socket:", response.message);
      alert(`강의실 참여 실패: ${response.message || "알 수 없는 오류"}`);
      hideChatContainer();
    }
  });

  // TODO: 다른 이벤트 리스너 추가 (userJoinedClassroom, userLeftClassroom, classroomDeleted)
}

/**
 * 소켓 연결 및 참여 시작 함수
 */
function connectAndJoin(userId, username) {
  if (!currentClassroomInfo || !currentClassroomId) {
    console.error("No classroom info set...");
    alert("참여할 강의실 정보가 없습니다.");
    return;
  }
  if (socket && socket.connected) {
    console.log("Disconnecting existing socket...");
    socket.disconnect();
  }
  socket = null;
  console.log(`Attempting to connect socket for user: ${userId} (${username})`);
  socket = io(BACKEND_URL, { auth: { userId, username } });
  setupSocketListeners(socket); // 새 소켓에 리스너 설정
}

/**
 * 참여자 목록 UI 업데이트 함수
 */
function updateParticipantsList(users) {
  if (!participantsList || !participantCount) {
    console.warn("Participant list UI elements not ready yet.");
    return;
  }
  participantsList.innerHTML = ""; // 기존 목록 비우기
  if (users && Array.isArray(users)) {
    users.forEach((user) => {
      const li = document.createElement("li");
      li.textContent = `${user.username || user.userId} (${user.userId})`;
      participantsList.appendChild(li);
    });
    participantCount.textContent = users.length; // 참여자 수 업데이트
  } else {
    participantsList.innerHTML = "<li>참여자가 없습니다.</li>";
    participantCount.textContent = "0";
  }
}

/**
 * 채팅 메시지 표시 함수
 */
function displayChatMessage(messageData) {
  if (!messagesDiv) {
    console.warn("Messages container not ready yet.");
    return;
  }
  const messageElement = document.createElement("div");
  const senderName = messageData.username || messageData.userId || "Unknown";
  const timestamp = messageData.timestamp
    ? new Date(messageData.timestamp).toLocaleTimeString()
    : new Date().toLocaleTimeString();
  messageElement.textContent = `[${timestamp}] ${senderName}: ${messageData.message}`;
  messagesDiv.appendChild(messageElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight; // 스크롤 하단으로 이동
}

/**
 * 메시지 전송 함수
 */
function sendMessage() {
  if (!currentClassroomId || !socket || !socket.connected) {
    alert("강의실에 참여 중이 아니거나 소켓 연결 상태가 올바르지 않습니다.");
    return;
  }
  const message = messageInput.value;
  if (message.trim() !== "") {
    console.log(`Sending message: ${message}`);
    socket.emit("sendMessage", { message: message });
    messageInput.value = "";
  }
}

/**
 * 채팅 컨테이너(강의실 영역) 표시 및 정보 설정
 */
function showChatContainer(classroom) {
  if (!chatContainer || !classroomInfoDiv) return;
  classroomInfoDiv.textContent = `강의실: ${classroom.classroom_name} (코드: ${classroom.classroom_code})`;
  chatContainer.style.display = "block";
  if (createClassroomBtn) createClassroomBtn.disabled = true;
}

/**
 * 채팅 컨테이너(강의실 영역) 숨김 및 상태 초기화
 */
function hideChatContainer() {
  if (!chatContainer) return;
  currentClassroomId = null;
  currentClassroomInfo = null;
  chatContainer.style.display = "none";
  if (messagesDiv) messagesDiv.innerHTML = "";
  if (messageInput) messageInput.value = "";
  if (createClassroomBtn) createClassroomBtn.disabled = false;
}

/**
 * API 응답 결과 표시 함수
 */
function displayResponse(data, status) {
  if (!responseArea) return;
  responseArea.className = "";
  if (status >= 200 && status < 300) {
    responseArea.classList.add("success");
  } else {
    responseArea.classList.add("error");
  }
  responseArea.textContent =
    `Status: ${status}\n` + JSON.stringify(data, null, 2);
  console.log(`API Response (Status: ${status}):`, data);
}

// --- DOM 로드 후 초기화 및 이벤트 리스너 연결 ---
document.addEventListener("DOMContentLoaded", () => {
  // DOM 요소 가져오기
  userIdInput = document.getElementById("userId");
  userNameInput = document.getElementById("userName");
  managerIdInput = document.getElementById("managerId");
  classroomInput = document.getElementById("classroom-input");
  createClassroomBtn = document.getElementById("create-classroom");
  joinCodeInput = document.getElementById("joinClassroomCode");
  joinClassroomBtn = document.getElementById("joinClassroomBtn");
  chatContainer = document.getElementById("chat-container");
  classroomInfoDiv = document.getElementById("classroomInfo");
  leaveClassroomBtn = document.getElementById("leaveClassroomBtn");
  deleteClassroomBtn = document.getElementById("deleteClassroomBtn");
  messagesDiv = document.getElementById("messages");
  messageInput = document.getElementById("message-input");
  sendMessageBtn = document.getElementById("send-message");
  participantsList = document.getElementById("participantsList");
  participantCount = document.getElementById("participantCount");
  responseArea = document.getElementById("responseArea");

  console.log("DOM Loaded. Attaching listeners.");
  updateParticipantsList([]);

  // '강의실 생성 및 참여' 버튼 리스너
  if (createClassroomBtn) {
    createClassroomBtn.addEventListener("click", async () => {
      const classroomName = classroomInput.value;
      const managerId = managerIdInput.value;
      const username = userNameInput.value;
      if (!classroomName || !managerId || !username) {
        alert("사용자 ID, 사용자 이름, 생성자 ID, 교실 이름을 모두 입력하세요");
        return;
      }
      try {
        const response = await fetch(`${BACKEND_URL}/api/classrooms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manager_users_id: managerId,
            classroom_name: classroomName,
          }),
        });
        const data = await response.json();
        displayResponse(data, response.status);
        if (data.success && data.classroom) {
          alert(
            `"${classroomName}" 교실 생성 성공! (코드: ${data.classroom.classroom_code})`
          );
          currentClassroomId = data.classroom.classroom_id;
          currentClassroomInfo = data.classroom;
          connectAndJoin(managerId, username);
          showChatContainer(data.classroom);
        } else {
          alert(`교실 생성 실패: ${data.message}`);
        }
      } catch (error) {
        console.error("교실 생성 오류:", error);
        displayResponse({ success: false, message: error.message }, 500);
        alert(`교실 생성 중 오류: ${error.message}`);
      }
    });
  } else {
    console.warn("Create classroom button not found.");
  }

  // '코드로 접속' 버튼 리스너
  if (joinClassroomBtn) {
    joinClassroomBtn.disabled = false;
    joinClassroomBtn.addEventListener("click", async () => {
      const code = joinCodeInput.value.trim().toUpperCase();
      const userId = userIdInput.value.trim();
      const username = userNameInput.value.trim();
      if (!code || !userId || !username) {
        alert("강의실 코드, 사용자 ID, 사용자 이름은 필수입니다.");
        return;
      }
      console.log(
        `Attempting to join classroom with code: ${code} as user: ${userId}(${username})`
      );
      try {
        const response = await fetch(`${BACKEND_URL}/api/classrooms/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, userId }),
        });
        const data = await response.json();
        displayResponse(data, response.status);
        if (response.ok && data.success && data.classroom) {
          alert(`강의실 코드 확인 완료: ${data.message}`);
          currentClassroomId = data.classroom.classroom_id;
          currentClassroomInfo = data.classroom;
          connectAndJoin(userId, username);
          showChatContainer(data.classroom);
        } else {
          alert(`강의실 접속 실패: ${data.message || "알 수 없는 오류"}`);
        }
      } catch (error) {
        console.error("코드로 참여 API 호출 오류:", error);
        displayResponse({ success: false, message: error.message }, 500);
        alert(`강의실 접속 중 오류 발생: ${error.message}`);
      }
    });
  } else {
    console.warn("Join classroom button not found.");
  }

  // 메시지 전송/입력 리스너
  if (sendMessageBtn) {
    sendMessageBtn.addEventListener("click", sendMessage);
  } else {
    console.warn("Send message button not found.");
  }
  if (messageInput) {
    messageInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
      }
    });
  } else {
    console.warn("Message input not found.");
  }

  // TODO: 나가기, 삭제 버튼 리스너 추가
}); // DOMContentLoaded 끝
