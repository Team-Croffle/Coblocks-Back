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
  if (!socketInstance || socketInstance._listenersSetup) {
    // console.log("Listeners already set up or socket invalid."); // 필요시 로깅
    return;
  }
  console.log(`Setting up listeners for socket: ${socketInstance.id}`);

  // 기본 이벤트 리스너
  socketInstance.on("connect", () => {
    console.log(`Socket connected: ${socketInstance.id}`);
    // 연결 성공 후, 참여하려는 강의실 정보가 있다면 JOIN 이벤트 자동 발송
    if (
      currentClassroomInfo &&
      currentClassroomId === currentClassroomInfo.classroom_id
    ) {
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
    hideChatContainer();
    socket = null;
  });

  socketInstance.on("error", (err) => {
    console.error("Socket error:", err);
    alert(`Socket 오류: ${err.message || err}`);
  });

  // 강의실/채팅 관련 이벤트 리스너
  socketInstance.on("classroomMessage", (data) => {
    displayChatMessage(data);
  });

  socketInstance.on("joinClassroomSuccess", (response) => {
    console.log("Received joinClassroomSuccess:", response);
    if (response.success && response.users && response.classroom) {
      showChatContainer(response.classroom);
      updateParticipantsList(response.users);
      console.log(
        `Successfully joined room ${response.classroom.classroom_code}. Manager: ${response.isManager}`
      );
    } else {
      console.error("Failed to join classroom via socket:", response.message);
      alert(`강의실 참여 실패: ${response.message || "알 수 없는 오류"}`);
      hideChatContainer();
      if (socket) socket.disconnect();
      socket = null;
    }
  });

  socketInstance.on("userJoinedClassroom", (data) => {
    console.log("Received userJoinedClassroom:", data);
    if (data && data.users) {
      updateParticipantsList(data.users);
      const joiningUserName = data.username || data.userId || "Someone";
      displayChatMessage({
        username: "System",
        message: `${joiningUserName}님이 입장했습니다.`,
      });
    } else {
      console.warn(
        "Received userJoinedClassroom event without valid users data:",
        data
      );
    }
  });

  socketInstance.on("userLeftClassroom", (data) => {
    console.log("Received userLeftClassroom:", data);
    if (data && data.users) {
      updateParticipantsList(data.users);
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
    }
  });

  socketInstance.on("classroomDeleted", (data) => {
    console.log("Received classroomDeleted:", data);
    if (currentClassroomId === data.classroomId) {
      alert(
        data.message ||
          `참여 중인 강의실(ID: ${data.classroomId})이 삭제되었습니다.`
      );
      hideChatContainer();
      if (socket) socket.disconnect();
      socket = null;
    } else {
      console.warn(
        `Received classroomDeleted event for a room (${data.classroomId}) I wasn't in? Current room: ${currentClassroomId}`
      );
    }
  });

  socketInstance._listenersSetup = true; // 리스너 설정 완료 플래그 (임시)
}

/**
 * 소켓 연결 및 참여 시작 함수
 */
function connectAndJoin(userId, username) {
  if (!currentClassroomInfo || !currentClassroomId) {
    console.error(
      "No classroom info set before attempting to connect and join."
    );
    alert("참여할 강의실 정보가 없습니다.");
    return;
  }
  if (socket && socket.connected) {
    console.log(
      "Disconnecting existing socket before creating a new connection..."
    );
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
 * 채팅 컨테이너 표시 함수
 */
function showChatContainer(classroom) {
  if (!chatContainer || !classroomInfoDiv || !classroom) {
    console.warn(
      "Cannot show chat container, element or classroom data missing."
    );
    return;
  }
  classroomInfoDiv.textContent = `강의실: ${classroom.classroom_name} (코드: ${classroom.classroom_code})`;
  chatContainer.style.display = "block";
  if (createClassroomBtn) createClassroomBtn.disabled = true;
  if (joinClassroomBtn) joinClassroomBtn.disabled = true;
  if (leaveClassroomBtn) leaveClassroomBtn.disabled = false; // 나가기 버튼 활성화
  if (deleteClassroomBtn && userIdInput) {
    // 삭제 버튼 제어
    const currentUserId = userIdInput.value;
    if (currentUserId && currentUserId === classroom.manager_users_id) {
      deleteClassroomBtn.disabled = false;
      deleteClassroomBtn.style.display = "inline-block";
      console.log("Manager UI: Delete button enabled.");
    } else {
      deleteClassroomBtn.disabled = true;
      deleteClassroomBtn.style.display = "none";
      console.log("Non-manager UI: Delete button disabled.");
    }
  } else {
    if (deleteClassroomBtn) deleteClassroomBtn.style.display = "none";
  }
}

/**
 * 채팅 컨테이너 숨김 함수
 */
function hideChatContainer() {
  if (!chatContainer) return;
  currentClassroomId = null;
  currentClassroomInfo = null;
  chatContainer.style.display = "none";
  if (messagesDiv) messagesDiv.innerHTML = "";
  if (messageInput) messageInput.value = "";
  if (createClassroomBtn) createClassroomBtn.disabled = false;
  if (joinClassroomBtn) joinClassroomBtn.disabled = false;
  if (leaveClassroomBtn) leaveClassroomBtn.disabled = true; // 나갔으므로 비활성화
  if (deleteClassroomBtn) deleteClassroomBtn.disabled = true; // 나갔으므로 비활성화
  if (socket && socket.connected) {
    console.log("Disconnecting socket in hideChatContainer");
    socket.disconnect();
  } // 나가거나 삭제 시 연결 끊기
  socket = null;
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
  // 초기 버튼 상태
  if (leaveClassroomBtn) leaveClassroomBtn.disabled = true;
  if (deleteClassroomBtn) deleteClassroomBtn.disabled = true;

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

  // '강의실 나가기' 버튼 리스너 (API 호출 방식)
  if (leaveClassroomBtn) {
    leaveClassroomBtn.addEventListener("click", async () => {
      if (!currentClassroomId || !currentClassroomInfo) {
        alert("현재 참여 중인 강의실이 없습니다.");
        hideChatContainer();
        return;
      }
      const code = currentClassroomInfo.classroom_code;
      const userId = userIdInput.value.trim();
      if (!code || !userId) {
        alert("강의실 코드 또는 사용자 ID를 가져올 수 없습니다.");
        return;
      }
      if (
        !confirm(
          `'${currentClassroomInfo.classroom_name}' 강의실에서 나가시겠습니까?`
        )
      ) {
        return;
      }
      console.log(
        `Attempting to leave classroom ${code} via API as user ${userId}`
      );
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/classrooms/${code}/leave`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: userId }),
          }
        );
        console.log(`API Response Status (Leave): ${response.status}`);
        if (response.ok) {
          const data = await response.json();
          displayResponse(data, response.status);
          alert(data.message || "강의실에서 성공적으로 나갔습니다.");
          hideChatContainer();
        } else {
          const errorData = await response.json();
          displayResponse(errorData, response.status);
          alert(
            `나가기 실패: ${
              errorData.message || `Status code ${response.status}`
            }`
          );
        }
      } catch (error) {
        console.error("강의실 나가기 API 호출 오류:", error);
        displayResponse({ success: false, message: error.message }, 500);
        alert(`나가기 처리 중 오류 발생: ${error.message}`);
      }
    });
  } else {
    console.warn("Leave classroom button not found.");
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

  // '강의실 삭제' 버튼 리스너 (전체 교체)
  if (deleteClassroomBtn) {
    deleteClassroomBtn.addEventListener("click", async () => {
      // 참여중인 강의실 정보가 있는지 먼저 확인
      if (!currentClassroomInfo || !currentClassroomId) {
        alert("현재 참여 중인 강의실 정보가 없습니다. (State Error)");
        return;
      }

      // <<<--- API 호출 전에 필요한 정보 로컬 변수에 저장 ---<<<
      const classroomNameToDelete = currentClassroomInfo.classroom_name;
      const classroomCodeToDelete = currentClassroomInfo.classroom_code;
      const classroomIdToDelete = currentClassroomId; // 필요시 사용 (현재는 직접 사용 X)
      const currentUserId = userIdInput.value.trim(); // 현재 입력된 사용자 ID

      // 변수 할당 후 confirm 창 띄우기
      if (
        !confirm(
          `정말로 강의실 '${classroomNameToDelete}' (코드: ${classroomCodeToDelete})을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
        )
      ) {
        return; // 사용자가 '취소' 선택
      }
      // 필요한 변수들이 있는지 최종 확인
      if (!classroomCodeToDelete || !currentUserId) {
        alert("강의실 코드 또는 사용자 ID를 가져올 수 없습니다.");
        return;
      }

      console.log(
        `Attempting to delete classroom with code: ${classroomCodeToDelete} by user: ${currentUserId}`
      );
      try {
        // fetch API 호출 (로컬 변수 사용)
        const response = await fetch(
          `${BACKEND_URL}/api/classrooms/${classroomCodeToDelete}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            // 임시 인증: 요청 본문에 userId 포함
            body: JSON.stringify({ userId: currentUserId }),
          }
        );
        console.log(`API Response Status (Delete): ${response.status}`);

        if (response.ok) {
          // 200 OK 또는 204 No Content 등 성공 상태
          // 성공 alert 메시지 (로컬 변수 사용)
          alert(
            `강의실 '${classroomNameToDelete}'이(가) 성공적으로 삭제되었습니다.`
          );
          // UI 정리 (hideChatContainer가 소켓 정리 포함)
          hideChatContainer();
          // 백엔드가 CLASSROOM_DELETED 이벤트를 다른 참여자에게 보냄
        } else {
          // 실패 응답 처리 (4xx, 5xx 에러)
          let errorData = {
            message: `Deletion failed with status ${response.status}`,
          };
          try {
            // 오류 응답에 본문이 있을 경우 파싱 시도
            errorData = await response.json();
          } catch (parseError) {
            console.error("Could not parse error response body:", parseError);
          }
          displayResponse(errorData, response.status); // 오류 정보 표시
          alert(
            `강의실 삭제 실패: ${
              errorData.message || `Status code ${response.status}`
            }`
          );
        }
      } catch (error) {
        // 네트워크 오류 등 fetch 자체 오류
        console.error("강의실 삭제 API 호출 오류:", error);
        displayResponse({ success: false, message: error.message }, 500);
        alert(`강의실 삭제 중 오류 발생: ${error.message}`);
      }
    });
  } else {
    console.warn("Delete classroom button not found.");
  }
}); // DOMContentLoaded 끝
