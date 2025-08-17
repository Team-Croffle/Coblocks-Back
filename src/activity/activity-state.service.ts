import { Injectable } from '@nestjs/common';
import { Activity } from './activity.interface';
import { WsException } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class ActivityStateService {
    private activities = new Map<string, Activity>(); //key: classroomId 문제풀이활동 세션을 관리하기 위함

    // classroomService에서 createRoom메서드가 실행될 때 해당 강의실의 활동 상태를 초기화함
    // event 구독 방식으로 처리
    @OnEvent('room.created')
    handleRoomCreated(data: { roomId: string }) {
        this.initializeActivity(data.roomId);
    }

    // 특정 강의실에 대한 문제풀이 활동 세션을 초기화 함
    initializeActivity(classroomId: string) {
        if (!this.activities.has(classroomId)) {
            this.activities.set(classroomId, {
                classroomId: classroomId,
                status: 'waiting',
                currentQuest: null,
                partAssignments: [],
                submissions: {},
            });
        }
    }

    // 선택된 문제를 활동 상태에 저장함
    setSelectedQuest(classroomId: string, questDetails: any) {
        const activity = this.activities.get(classroomId);
        if (activity) {
            activity.currentQuest = questDetails;
            activity.status = 'waiting'; // 문제가 선택되었으므로 '시작 대기' 상태
            console.log(`[ActivityStateService] Quest ${questDetails.quest_id} selected for room ${classroomId}`);
        } else {
            console.error(`[ActivityStateService] Failed to set quest. Activity state not found for room ${classroomId}`);
        }
    }

    // 활동을 'active' 상태로 변경하고, 파트 배정 정보를 저장함
    startActivity(classroomId: string, assignments: any[]): Activity | null{
        const activity = this.activities.get(classroomId);
        if (activity && activity.status === 'waiting') {
            activity.status = 'active'; // 'waiting' -> 'active'
            activity.partAssignments = assignments;
            console.log(`[ActivityStateService] Activity status changed to 'active' for room ${classroomId}.`);
            return activity;
        }
        return null; // 활동을 시작할 수 없는 경우(이미 시작 되었거나 종료됨)
    }

    // 특정 사용자의 제출물을 활동상태에 저장/업데이트 함
    updateUserSubmission(classroomId: string, userId: string, partNumber: number, submissionContent: any): Activity | null {
        const activity = this.activities.get(classroomId);
        if (activity && activity.status === 'active') { // 활동이 'active' 상태일 때만 제출 가능
            // 제출물 업데이트
            if (!activity.submissions[userId]) {
                activity.submissions = {};
            }
            activity.submissions[userId] = {
                partNumber: partNumber,
                content: submissionContent,
            };
            console.log(`[ActivityStateService] Submission updated for user ${userId} in room ${classroomId}.`);
            return activity;
        }
        return null; // 제출할 수 없는 경우
    }

    // 해당 강의실의 활동 상태를 초기화 함(문제 선택 전 상태로 되돌림)
    endCurrentActivity(classroomId: string): boolean {
        const activity = this.activities.get(classroomId);
        // 활동이 'active' 또는 'waiting' 일 때만 초기화 의미가 있음
        if (activity && (activity.status === 'active' || activity.status === 'waiting')) {
            activity.status = 'waiting'; // 상태를 'waiting'으로 되돌림
            activity.currentQuest = null; // 현재 문제 세트 초기화
            activity.partAssignments = []; // 파트 배정 초기화
            activity.submissions = {}; // 제출물 초기화
            console.log(`[ActivityStateService] Activity ended and reset for room ${classroomId}.`);
            return true;
        }
        // 종료할 활동이 없는 경우 (이미 초기 상태)
        return false;
    }

    // 활동 상태를 가져오는 헬퍼 메소드
    getActivityState(classroomId: string): Activity | undefined {
        return this.activities.get(classroomId);
    }

    // 해당하는 방의 모든 제출물을 가져옴
    getAllSubmissions(classroomId: string): Record<string, any> {
        const activity = this.activities.get(classroomId);
        if (activity) {
            return activity.submissions;
        }
        throw new WsException('활동 정보가 없습니다.');
    }
}
