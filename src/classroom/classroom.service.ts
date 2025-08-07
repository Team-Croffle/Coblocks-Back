import { Injectable } from '@nestjs/common';
import { Classroom } from './classroom.interface';
import { WsException } from '@nestjs/websockets';
import { Participant } from './Participant.interface';
import { Server } from 'socket.io';
import { Activity } from 'src/activity/activity.interface';
import { SupabaseService } from 'src/database/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { events } from 'src/utils/events';

const MANAGER_RECONNECT_TIMEOUT = 60000; // 1분

@Injectable()
export class ClassroomService {
    private roomData = new Map<string, Classroom>(); // key: classroomId
    private roomCodeMap = new Map<string, string>(); // key: roomCode, value: classroomId
    private userRoomMap = new Map<string, string>(); // key: socketId, value: classroomId
    private roomRecoveryTimers = new Map<string, NodeJS.Timeout>(); // key: classroomId, value: timerId

    private activities = new Map<string, Activity>(); //key: classroomId 문제풀이활동 세션을 관리하기 위함

    private readonly supabase: SupabaseClient; // supabase 클라이언트를 담을 변수

    constructor(private readonly supabaseService: SupabaseService) {
        this.supabase = this.supabaseService.getClient(); // Supabase 클라이언트 초기화
    }

    // 방 생성
    createRoom(id: string, name: string, code: string, managerId: string, managerSocketId: string, managerName: string): Classroom{
        if (this.roomCodeMap.has(code)){ // 방 코드 중복 체크
            throw new WsException('이미 사용 중인 방 코드입니다.'); 
        }
        const newRoom: Classroom = {
            id,
            name,
            code,
            managerId,
            managerSocketId, 
            participants: new Map<string, Participant>(), // key: socketId, value: Participant
            createdAt: new Date(),
            state: 'wait',
        };
        // 개설자를 참여자 목록에 추가
        newRoom.participants.set(managerSocketId, {
            userId: managerId,
            userName: managerName,
            socketId: managerSocketId,
        });

        // 방 생성 시 해당 방의 활동 상태도 같이 초기화
        this.initializeActivity(id);

        this.roomData.set(id, newRoom);
        this.roomCodeMap.set(code, id); // 방 코드와 ID 매핑
        this.userRoomMap.set(managerSocketId, id); // 개설자 소켓 ID와 방 ID 매핑
        console.log(`[ClassroomService] Room Created: ${name} (${code}), Manager: ${managerName} (${managerId})`);
        return newRoom
    }

    // 초대 코드로 방 존재 여부 확인
    findRoomByCode(code: string): Classroom | undefined {
        const classroomId = this.roomCodeMap.get(code); // 방 코드로 방 ID 찾기
        return classroomId ? this.roomData.get(classroomId) : undefined; // 방 ID로 방 정보 찾기
    }

    //방 참가
    joinRoom(code: string, userId: string, userName: string, socketId: string, server: Server): Classroom {
        const room = this.findRoomByCode(code); // 방 찾기
        if (!room || room === undefined) throw new WsException('존재하지 않는 방입니다.'); // 방이 존재하지 않으면 에러

        const isManager = room.managerId === userId; // 참가자가 개설자인지 확인

        // 방이 유예기간인지 확인
        if (this.isGracePeriodActive(room.id)) {
            // 유예기간 중에는 오직 해당 방의 개설자만 재접속 가능
            if (!isManager) {
                throw new WsException('개설자가 일시적으로 자리를 비웠습니다. 잠시 후 다시 시도해주세요.');
            }// 개설자가 재접속하는 경우는 이 검사를 통과하여 아래 로직으로 진행됩니다.
            console.log(`[ClassroomService] Manager ${userName} is rejoining during grace period.`);
        } else {
            // 방이 정상 상태일 때
            // 개설자가 아닌 경우에만 만석 체크
            if(!isManager && room.state === 'full') {
                throw new WsException('방이 가득 찼습니다.'); // 방이 만석이면 에러
            }
        }

        // 개설자가 아닌 경우에만 만석 체크
        if (room.managerId !== userId && room.state === 'full') {
            throw new WsException('방이 가득 찼습니다.'); // 방이 만석이면 에러
        }

        // 동일 userId의 이전 소켓 정보 찾기 및 제거 (새로 고침 등으로 인한 중복 참가 방지)
        let oldSocketId: string | null = null;
        for (const [sid, participant] of room.participants.entries()) {
            if (participant.userId == userId) {
                oldSocketId = sid; // 기존 소켓 ID 저장
                break;
            }
        }

        // 이전 소켓이 존재하면 해당 소켓을 제거하고 새로 참가
        if (oldSocketId && oldSocketId !== socketId) {
            console.log(`[ClassroomService] User ${userId} is rejoining. Removing old socket ${oldSocketId}.`);
            room.participants.delete(oldSocketId); // 기존 소켓 정보 제거
            this.userRoomMap.delete(oldSocketId); // 사용자-방 매핑에서 제거
            const oldSocket = server.sockets.sockets.get(oldSocketId);
            if (oldSocket) oldSocket.disconnect(true); // 기존 소켓 연결 종료
        }

        // 개설자 재접속 시 유예기간 타이머 취소
        if (room.managerId === userId) {
            console.log(`[ClassroomService] Manager ${userId} joining/rejoining room ${room.id}.`);
            room.managerSocketId = socketId; // 개설자 소켓 ID 업데이트
            if (this.roomRecoveryTimers.has(room.id)) {
                clearTimeout(this.roomRecoveryTimers.get(room.id)); // 유예기간 타이머 취소
                this.roomRecoveryTimers.delete(room.id);
                console.log(`[ClassroomService] Recovery timer for room ${room.id} cancelled.`);
            }
        }

        const newParticipant: Participant = { userId, userName, socketId };
        room.participants.set(socketId, newParticipant); // 새 참가자 추가
        this.userRoomMap.set(socketId, room.id); // 새 소켓 ID와 방 ID 매핑
        console.log(`[ClassroomService] User ${userName} (${userId}) joined room ${code} with socket ${socketId}.`);

        if (room.participants.size >= 4) room.state = 'full';
        
        return room;
    }

    // 소켓 연결 해제 시(문제나 오류로 인한 연결 해제 시 메모리 정리)
    removeUserOnDisconnect(socketId: string, server: Server) : { room: Classroom, leftUser: Participant, wasManager: boolean, roomTerminated: boolean } | null {
        const classroomId = this.userRoomMap.get(socketId);
        if (!classroomId) return null; // 방에 참가하지 않은 경우

        const room = this.roomData.get(classroomId);
        if (!room) return null; // 방이 존재하지 않는 경우

        const leftUser = room.participants.get(socketId);
        if (!leftUser) return null; // 참가자가 방에 없는 경우

        // 메모리에서 사용자 제거
        room.participants.delete(socketId);
        this.userRoomMap.delete(socketId); // 사용자-방 매핑에서 제거
        console.log(`[ClassroomService] User ${leftUser.userName} (socket: ${socketId}) disconnected from room ${room.id}.`);

        const wasManager = room.managerId === leftUser.userId; // 방장이었는지 확인
        let roomTerminated = false;

        if (wasManager) {
            // 개설자일 경우 유예기간 시작
            console.log(`[ClassroomService] Manager ${leftUser.userName} disconnected. Starting grace period for room ${room.id}.`);
            room.managerSocketId = null;
            room.state = 'grace_period';
            this.startManagerGracePeriod(classroomId, leftUser.userId, server);
        } else if (room.participants.size === 0) {
            // 일반 사용자가 마지막으로 나간 경우, 방 즉시 삭제
            console.log(`[ClassroomService] Room ${classroomId} is now empty. Deleting room immediately.`);
            this.terminateRoomImmediately(classroomId, server, this.userRoomMap);
            roomTerminated = true;
        }
        return { room, leftUser, wasManager, roomTerminated };
    }

    // 방 퇴장
    leaveRoom(roomCode: string, userId: string, socketId: string, server: Server) {
        const classroomId = this.roomCodeMap.get(roomCode);
        if (!classroomId) throw new WsException('존재하지 않는 방입니다.'); // 방 코드가 존재하지 않으면 에러

        const room = this.roomData.get(classroomId);
        if (!room) throw new WsException('존재하지 않는 방입니다.'); // 방이 존재하지 않으면 에러

        // 나가는 사람이 개설자인 경우: 즉시 방 종료
        if (room.managerId === userId) {
            this.terminateRoomImmediately(classroomId, server, this.userRoomMap);
            return { success: true, message: '방이 삭제되었습니다!' };
        } else {
            // 일반 참가자인 경우
            room.participants.delete(socketId); // 참가자 목록에서 제거
            this.userRoomMap.delete(socketId); // 사용자-방 매핑에서 제거
            const remainingParticipants = Array.from(room.participants.values());

            if (room.participants.size === 0) {
                // 마지막 참여자가 명시적으로 나간 경우에도 방 종료
                this.terminateRoomImmediately(classroomId, server, this.userRoomMap);
                return { success: true, message: '마지막 참여자가 나가 방이 삭제되었습니다.', remainingParticipants: [] };
            }
            if (room.participants.size < 4 && room.state === 'full') {
                room.state = 'wait';
            }
            return { success: true, message: '방을 성공적으로 나갔습니다!', participants: remainingParticipants, state: room.state };
        }
    }

    isGracePeriodActive(classroomId: string): boolean {
        return this.roomRecoveryTimers.has(classroomId);
    }

    startManagerGracePeriod(classroomId: string, managerId: string, server: Server) {
        console.log(`[ClassroomService] Starting ${MANAGER_RECONNECT_TIMEOUT / 1000}s grace period for manager ${managerId} in room ${classroomId}.`);
        const timerId = setTimeout(async () => {
            const room = this.roomData.get(classroomId);
            // 유예 기간 만료 시, 여전히 개설자가 재접속하지 않았는지 최종 확인
            if (room && this.isGracePeriodActive(classroomId)) {
                console.log(`[ClassroomService] Grace period expired for room ${classroomId}. Terminating.`);
                await this.terminateRoomImmediately(classroomId, server, this.userRoomMap);
            }
            this.roomRecoveryTimers.delete(classroomId);
        }, MANAGER_RECONNECT_TIMEOUT);
        this.roomRecoveryTimers.set(classroomId, timerId);
    }
    
    // --- 명시적 즉시 방 삭제 메소드 ---
    async terminateRoomImmediately(classroomId: string, server: Server, userRoomMap: Map<string, string>) {
        const room = this.roomData.get(classroomId);
        if (!room) return false;
        console.log(`[ClassroomService] Terminating room ${classroomId} immediately.`);

        if (this.roomRecoveryTimers.has(classroomId)) {  // 유예 기간 타이머가 설정되어 있다면
            clearTimeout(this.roomRecoveryTimers.get(classroomId)); // 타이머를 정리
            this.roomRecoveryTimers.delete(classroomId); // 타이머 삭제
        }

        try {
            // Supabase에서 방 정보 삭제
            const { error: rpcError } = await this.supabase.rpc('handle_delete_classroom', {
                target_classroom_id: classroomId
            });

            if (rpcError) {
                throw rpcError;
            }
            console.log(`[ClassroomService] Classroom ${room.id} deleted from DB Successfully.`);

            // DB 삭제가 성공했을 때만 메모리에서 방 정보 삭제
            server.to(room.code).emit(events.CLASSROOM_DELETED, {
                classroomId: room.id,
                message: `강의실이 종료되었습니다.`,
            });

            // 방에 있는 모든 소켓 연결 강제 해제
            const socketsInRoom = await server.in(room.code).fetchSockets();
            socketsInRoom.forEach(sock => sock.disconnect(true));

            // 메모리 정리
            for (const socketId of room.participants.keys()) {
                userRoomMap.delete(socketId);
            }   
            this.roomCodeMap.delete(room.code);
            this.roomData.delete(classroomId);

            return true;
        } catch (error) {
            console.error(`[ClassroomService] DB delete error for ${room.id}: ${error.message}`);
            if (room.managerSocketId) {
                server.to(room.managerSocketId).emit('error', {
                    message: '강의실을 종료하는 데 실패했습니다. 잠시 후 다시 시도해주세요.',
                });
            }
            return false;
        }
    }

    // --- 활동 관련 메소드 ---

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
            console.log(`[ClassroomService: Activity] Initialized activity for classroom ${classroomId}`);
        }
    }

    // 선택된 문제를 활동 상태에 저장함
    setSelectedQuest(classroomId: string, questDetails: any) {
        const activity = this.activities.get(classroomId);
        if (activity) {
            activity.currentQuest = questDetails;
            activity.status = 'waiting'; // 문제가 선택되었으므로 '시작 대기' 상태
            console.log(`[ClassroomService] Quest ${questDetails.quest_id} selected for room ${classroomId}`);
        } else {
            console.error(`[ClassroomService] Failed to set quest. Activity state not found for room ${classroomId}`);
        }
    }

    // 활동을 'active' 상태로 변경하고, 파트 배정 정보를 저장함
    startActivity(classroomId: string, assignments: any[]): Activity | null{
        const activity = this.activities.get(classroomId);
        if (activity && activity.status === 'waiting') {
            activity.status = 'active'; // 'waiting' -> 'active'
            activity.partAssignments = assignments;
            console.log(`[ClassroomService] Activity status changed to 'active' for room ${classroomId}.`);
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
            console.log(`[ClassroomService] Submission updated for user ${userId} in room ${classroomId}.`);
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
            console.log(`[ClassroomService] Activity ended and reset for room ${classroomId}.`);
            return true;
        }
        // 종료할 활동이 없는 경우 (이미 초기 상태)
        return false;
    }

    // 활동 상태를 가져오는 헬퍼 메소드
    getActivityState(classroomId: string): Activity | undefined {
        return this.activities.get(classroomId);
    }

    // socketId로 방 ID를 찾는 헬퍼 메소드
    getRoomIdBySocketId(socketId: string): string | undefined {
        return this.userRoomMap.get(socketId);
    }

    // 방 ID로 방 정보 찾기
    getRoomById(classroomId: string): Classroom | undefined {
        return this.roomData.get(classroomId); // 방 ID로 방 정보 찾기
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
