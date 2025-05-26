# 프론트엔드 연동 가이드

## 목차
1. [Socket.IO 이벤트 구조](#socketio-이벤트-구조)
2. [인증 처리 방식](#인증-처리-방식)
3. [에러 처리 방식](#에러-처리-방식)
4. [데이터 구조 및 형식](#데이터-구조-및-형식)
5. [상태 관리 및 흐름](#상태-관리-및-흐름)
6. [실시간 동기화 처리](#실시간-동기화-처리)
7. [제한사항 및 주의점](#제한사항-및-주의점)

## Socket.IO 이벤트 구조

### 클라이언트 → 서버 이벤트
| 이벤트 이름 | 설명 | 페이로드 예시 |
|------------|------|-------------|
| `joinClassroom` | 강의실 참여 요청 | `{ classroomDetails: { classroom_id, classroom_code, manager_users_id, ... } }` |
| `leaveClassroom` | 강의실 퇴장 요청 | `{}` |
| `sendMessage` | 채팅 메시지 전송 | `{ message: "안녕하세요" }` |
| `refreshParticipantList` | 참가자 목록 갱신 요청 | `{}` (콜백 함수 사용) |
| `selectProblemSet` | 문제 세트 선택 | `{ quest_id: "quest-123" }` |
| `startActivity` | 활동 시작 요청 | `{}` |
| `submitSolution` | 문제 풀이 제출 | `{ submissionContent: { blocks: [...] } }` |
| `requestFinalSubmission` | 최종 제출물 요청 | `{}` |

### 서버 → 클라이언트 이벤트
| 이벤트 이름 | 설명 | 페이로드 예시 |
|------------|------|-------------|
| `joinClassroomSuccess` | 강의실 참여 성공 | `{ success: true, classroom: {...}, users: [...], isManager: true, userCount: 2, maxUsers: 4 }` |
| `userJoinedClassroom` | 다른 사용자 참여 알림 | `{ joinedUser: { userId, username }, userCount: 2, maxUsers: 4 }` |
| `userLeftClassroom` | 사용자 퇴장 알림 | `{ leftUser: { userId, username }, userCount: 1, maxUsers: 4 }` |
| `classroomMessage` | 채팅 메시지 수신 | `{ userId, username, message, timestamp }` |
| `classroomDeleted` | 강의실 삭제 알림 | `{ classroomId, message }` |
| `problemSelectedInfo` | 선택된 문제 정보 | `{ questInfo: {...} }` |
| `activityBegin` | 활동 시작 알림 | `{ questInfo: {...}, myPartNumber: 1, allParticipantAssignments: [...] }` |
| `submitSolutionSuccess` | 제출 성공 알림 | `{ username, partNumber, message }` |
| `finalSubmissionsData` | 최종 제출물 데이터 | `{ finalSubmissions: { "userId1": { partNumber: 1, content: {...} }, ... } }` |
| `error` | 오류 알림 | `{ message: "오류 메시지" }` |

## 인증 처리 방식

Socket.IO 연결 시 JWT 토큰을 인증 데이터로 전달해야 합니다.

```javascript
// 프론트엔드 연결 예시
const socket = io(BACKEND_URL, {
  auth: { token: accessToken } // Supabase 또는 자체 인증 시스템에서 발급받은 JWT 토큰
});

// 인증 실패 시 처리
socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error.message);
  // 인증 오류 처리 (예: 로그인 페이지로 리디렉션)
});
```

## 에러 처리 방식

서버에서는 다양한 상황에서 `error` 이벤트를 통해 오류를 전달합니다.

```javascript
// 에러 이벤트 리스너
socket.on("error", (errorData) => {
  console.error("Socket error:", errorData.message);
  // 사용자에게 오류 표시 (예: 토스트 메시지)
});

// 특정 기능별 오류 처리
socket.on("messageError", (errorData) => {
  console.error("Message error:", errorData.message);
  // 메시지 전송 관련 오류 처리
});
```

## 데이터 구조 및 형식

### 강의실 정보 구조
```javascript
{
  classroom_id: "uuid-string",
  classroom_code: "ABC123", // 6자리 초대 코드
  classroom_name: "알고리즘 스터디",
  manager_users_id: "user-uuid-string",
  created_at: "2023-05-15T09:30:00Z"
}
```

### 문제 데이터 구조
```javascript
{
  quest_id: "quest-123",
  quest_description: "협업 문제 해결하기",
  quest_difficulty: "medium",
  quest_type: "collaborative",
  quest_context: {
    is_equal: false, // false면 개인별 다른 문제, true면 공통 문제
    player1: { blocks: [...] }, // 첫 번째 참여자 Blockly 데이터
    player2: { blocks: [...] }, // 두 번째 참여자 Blockly 데이터
    // ...
    common: { blocks: [...] } // 공통 문제인 경우 사용
  },
  quest_question: {
    player1: "첫 번째 참여자 문제 설명",
    player2: "두 번째 참여자 문제 설명",
    // ... 또는 공통 문제인 경우 문자열
  },
  default_stage: { ... } // Blockly 기본 설정
}
```

### 제출 데이터 형식
```javascript
// submitSolution 이벤트 페이로드
{
  submissionContent: {
    blocks: ["test-block-1", "test-block-2"]
    // 또는 Blockly 워크스페이스 XML/JSON 데이터
  }
}

// 서버에 저장되는 형식
{
  "userId1": {
    partNumber: 1,
    content: { blocks: [...] }
  },
  "userId2": {
    partNumber: 2,
    content: { blocks: [...] }
  }
}
```

## 상태 관리 및 흐름

### 강의실 참여 흐름
1. 강의실 생성 또는 코드로 참여 (REST API 사용)
2. Socket.IO 연결 및 인증
3. `joinClassroom` 이벤트 발송
4. `joinClassroomSuccess` 이벤트 수신 및 UI 업데이트
5. 개설자: 문제 선택 (`selectProblemSet`)
6. 개설자: 활동 시작 (`startActivity`)
7. 모든 참여자: `activityBegin` 이벤트 수신 및 문제 풀이 UI 표시
8. 모든 참여자: 문제 풀이 후 제출 (`submitSolution`)
9. 개설자: 최종 제출물 요청 (`requestFinalSubmission`)
10. 모든 참여자: 최종 결과 확인 (`finalSubmissionsData`)

### 권한 관리
- **개설자(manager)만 가능한 작업**:
  - 문제 선택 (`selectProblemSet`)
  - 활동 시작 (`startActivity`)
  - 최종 제출물 요청 (`requestFinalSubmission`)
  - 강의실 삭제 (REST API)

- **모든 참여자 가능한 작업**:
  - 메시지 전송 (`sendMessage`)
  - 문제 풀이 제출 (`submitSolution`)
  - 강의실 퇴장 (`leaveClassroom`)

## 실시간 동기화 처리

### 참여자 목록 동기화
- 초기 참여 시 `joinClassroomSuccess` 이벤트에서 전체 목록 수신
- 새 참여자 입장 시 `userJoinedClassroom` 이벤트로 알림
- 참여자 퇴장 시 `userLeftClassroom` 이벤트로 알림
- 필요시 `refreshParticipantList` 이벤트로 최신 목록 요청 가능

### 제출 상태 동기화
- 참여자가 제출 시 `submitSolutionSuccess` 이벤트로 모든 참여자에게 알림
- 최종 제출물은 `finalSubmissionsData` 이벤트로 한 번에 전달

## 제한사항 및 주의점

1. **최대 참여자 수**: 강의실당 최대 4명까지 참여 가능
2. **개설자 연결 끊김**: 개설자가 연결 끊김 또는 퇴장 시 강의실 자동 종료
3. **인증 필수**: 모든 소켓 연결에 유효한 JWT 토큰 필요
4. **문제 선택 필수**: 활동 시작 전 반드시 문제 선택 필요
5. **파트 번호**: 참여자들에게는 1부터 시작하는 파트 번호 자동 할당
6. **동시 접속**: 같은 사용자 ID로 여러 기기에서 접속 시 이전 연결 자동 종료

---

이 문서는 프론트엔드와 백엔드 연동을 위한 기본 가이드입니다. 추가 질문이나 상세 정보가 필요한 경우 백엔드 개발팀에 문의하세요.