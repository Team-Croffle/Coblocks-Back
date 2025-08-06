import { Participant } from "./Participant.interface";

export interface Classroom {
    id: string; // 강의실ID(데이터베이스 내부 ID) (클라이언트로부터 받음)
    name: string; // 강의실 이름 (클라이언트로부터 받음)
    code: string; // 강의실 코드(강의실 입장용 코드) (클라이언트로부터 받음)
    managerId: string; // 강의실 개설자 ID(권한 체크용) (클라이언트로부터 받음)
    managerSocketId?: string | null; // 강의실 개설자 SocketID (연결 끊김시 null)
    participants: Map<string, Participant> // 참여자 ID 목록 key: classroomId
    createdAt: Date; // 강의실 생성 시간
    state: 'wait' | 'full' | 'running' | 'grace_period'; // 강의실 상태(대기, 만석, 진행 중, 개설자 재접속 대기 중)
}
