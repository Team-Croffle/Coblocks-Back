export interface Activity {
    classroomId: string; // 강의실 ID

    status: 'waiting' | 'active'; // 활동 상태 (대기중, 진행중)

    currentQuest: any | null;

    // 각 참여자에게 할당된 파트 번호 정보
    partAssignments: {
        userId: string;
        username: string;
        partNumber: number;
    }[];
    /**
     * 각 참여자가 제출한 결과물
     * Key: 참여자의 userId
     * Value: 제출된 정보 객체
     */
    submissions: Record<string,{
        partNumber: number;
        content: any; // Blockly JSON 데이터
    }>;
}
