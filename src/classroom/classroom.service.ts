import { Injectable } from '@nestjs/common';
import { Classroom } from './classroom.interface';
import { WsException } from '@nestjs/websockets';
import { Participant } from './Participant.interface';
import { Server } from 'socket.io';

const MANAGER_RECONNECT_TIMEOUT = 60000; // 1분

@Injectable()
export class ClassroomService {
    private roomData = new Map<string, Classroom>(); // key: classroomId
    private roomCodeMap = new Map<string, string>(); // key: roomCode, value: classroomId
    private userRoomMap = new Map<string, string>(); // key: socketId, value: classroomId
    private roomRecoveryTimers = new Map<string, NodeJS.Timeout>(); // key: classroomId, value: timerId

    // 방 생성
    createRoom(id: string, name: string, code: string, managerId: string, managerSocketId: string, managername: string): Classroom{
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
            username: managername,
            socketId: managerSocketId,
        });

        this.roomData.set(id, newRoom);
        this.roomCodeMap.set(code, id); // 방 코드와 ID 매핑
        this.userRoomMap.set(managerSocketId, id); // 개설자 소켓 ID와 방 ID 매핑
        console.log(`[Service] Room Created: ${name} (${code}), Manager: ${managername} (${managerId})`);
        return newRoom
    }
 
    // 초대 코드로 방 존재 여부 확인
    findRoomByCode(code: string): Classroom | undefined {
        const classroomId = this.roomCodeMap.get(code); // 방 코드로 방 ID 찾기
        return classroomId ? this.roomData.get(classroomId) : undefined; // 방 ID로 방 정보 찾기
    }

    //방 참가
    joinRoom(code: string, userId: string, username: string, socketId: string, server: Server): Classroom {
        const room = this.findRoomByCode(code); // 방 찾기
        if (!room || room === undefined) throw new WsException('존재하지 않는 방입니다.'); // 방이 존재하지 않으면 에러

        const isManager = room.managerId === userId; // 참가자가 개설자인지 확인

        // 방이 유예기간인지 확인
        if (this.isGracePeriodActive(room.id)) {
            // 유예기간 중에는 오직 해당 방의 개설자만 재접속 가능
            if (!isManager) {
                throw new WsException('개설자가 일시적으로 자리를 비웠습니다. 잠시 후 다시 시도해주세요.');
            }// 개설자가 재접속하는 경우는 이 검사를 통과하여 아래 로직으로 진행됩니다.
            console.log(`[Service] Manager ${username} is rejoining during grace period.`);
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
            console.log(`[Service] User ${userId} is rejoining. Removing old socket ${oldSocketId}.`);
            room.participants.delete(oldSocketId); // 기존 소켓 정보 제거
            this.userRoomMap.delete(oldSocketId); // 사용자-방 매핑에서 제거
            const oldSocket = server.sockets.sockets.get(oldSocketId);
            if (oldSocket) oldSocket.disconnect(true); // 기존 소켓 연결 종료
        }

        // 개설자 재접속 시 유예기간 타이머 취소
        if (room.managerId === userId) {
            console.log(`[Service] Manager ${userId} joining/rejoining room ${room.id}.`);
            room.managerSocketId = socketId; // 개설자 소켓 ID 업데이트
            if (this.roomRecoveryTimers.has(room.id)) {
                clearTimeout(this.roomRecoveryTimers.get(room.id)); // 유예기간 타이머 취소
                this.roomRecoveryTimers.delete(room.id);
                console.log(`[Service] Recovery timer for room ${room.id} cancelled.`);
            }
        }

        const newParticipant: Participant = { userId, username, socketId };
        room.participants.set(socketId, newParticipant); // 새 참가자 추가
        this.userRoomMap.set(socketId, room.id); // 새 소켓 ID와 방 ID 매핑
        console.log(`[Service] User ${username} (${userId}) joined room ${code} with socket ${socketId}.`);

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
        console.log(`[Service] User ${leftUser.username} (socket: ${socketId}) disconnected from room ${room.id}.`);

        const wasManager = room.managerId === leftUser.userId; // 방장이었는지 확인
        let roomTerminated = false;

        if (wasManager) {
            // 개설자일 경우 유예기간 시작
            console.log(`[Service] Manager ${leftUser.username} disconnected. Starting grace period for room ${room.id}.`);
            room.managerSocketId = null;
            room.state = 'grace_period';
            this.startManagerGracePeriod(classroomId, leftUser.userId, server);
        } else if (room.participants.size === 0) {
            // 일반 사용자가 마지막으로 나간 경우, 방 즉시 삭제
            console.log(`[Service] Room ${classroomId} is now empty. Deleting room immediately.`);
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
                return { success: false, message: '마지막 참여자가 나가 방이 삭제되었습니다.', remainingParticipants: [] };
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
        console.log(`[Service] Starting ${MANAGER_RECONNECT_TIMEOUT / 1000}s grace period for manager ${managerId} in room ${classroomId}.`);
        const timerId = setTimeout(async () => {
            const room = this.roomData.get(classroomId);
            // 유예 기간 만료 시, 여전히 개설자가 재접속하지 않았는지 최종 확인
            if (room && this.isGracePeriodActive(classroomId)) {
                console.log(`[Service] Grace period expired for room ${classroomId}. Terminating.`);
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
        console.log(`[Service] Terminating room ${classroomId} immediately.`);

        if (this.roomRecoveryTimers.has(classroomId)) {
            clearTimeout(this.roomRecoveryTimers.get(classroomId));
            this.roomRecoveryTimers.delete(classroomId);
        }

        server.to(room.code).emit('classroom:deleted', {
            classroomId: room.id,
            message: `강의실이 종료되었습니다.`,
        });
        
        try {
            const socketsInRoom = await server.in(room.code).fetchSockets();
            socketsInRoom.forEach(sock => sock.disconnect(true));
        } catch (err) { console.error(`[Service] Error disconnecting sockets in ${classroomId}: ${err.message}`); }

        try {
            //await ClassroomModel.delete(room.id);
            console.log(`[Service] Classroom ${room.id} deleted from DB.`);
        } catch (dbError) {
            console.error(`[Service] DB delete error for ${room.id}: ${dbError.message}`);
        }
        
        // 메모리 정리
        for (const socketId of room.participants.keys()) {
            userRoomMap.delete(socketId);
        }   
        this.roomCodeMap.delete(room.code);
        this.roomData.delete(classroomId);
        return true;
    }
}
