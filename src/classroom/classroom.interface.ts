export interface Classroom {
    id: string; // 강의실ID(데이터베이스 내부 ID)
    code: string; // 강의실 코드(강의실 입장용 코드)
    managerId: string; // 강의실 개설자 ID(권한 체크용)
    managerSocketId?: string; // 강의실 개설자 SocketID
    participants: string[]; // 참여자 ID 목록
    createdAt: Date; // 강의실 생성 시간
    state: 'wait' | 'full' | 'running'; // 강의실 상태(대기, 만석, 진행 중)
}
