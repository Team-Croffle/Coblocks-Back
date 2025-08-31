import { Injectable } from '@nestjs/common';
import { Classroom } from './classroom.interface';
import { WsException } from '@nestjs/websockets';
import { Participant } from './Participant.interface';
import { Server } from 'socket.io';
import { SupabaseService } from 'src/database/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { events } from 'src/utils/events';
import { EventEmitter2 } from '@nestjs/event-emitter';

const MANAGER_RECONNECT_TIMEOUT = 60000; // 1분

@Injectable()
export class ClassroomService {
  private roomData = new Map<string, Classroom>(); // key: classroomId // 강의실 데이터
  private roomCodeMap = new Map<string, string>(); // key: roomCode, value: classroomId
  private userRoomMap = new Map<string, string>(); // key: socketId, value: classroomId
  private roomRecoveryTimers = new Map<string, NodeJS.Timeout>(); // key: classroomId, value: timerId

  private readonly supabase: SupabaseClient; // supabase 클라이언트를 담을 변수

  constructor(
    private readonly eventEmitter: EventEmitter2, // 이벤트 발행을 위한 EventEmitter2
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient(); // Supabase 클라이언트 초기화
  }

  // 방 생성
  createRoom(
    id: string,
    name: string,
    code: string,
    managerId: string,
    managerSocketId: string,
    managerName: string,
  ): Classroom {
    if (this.roomCodeMap.has(code)) {
      // 방 코드 중복 체크
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

    // 방 생성 시 해당 방의 활동 상태도 같이 초기화 - eventEmitter를 이용해 의존없는 방식으로 구현
    this.eventEmitter.emit('room.created', { roomId: id });

    this.roomData.set(id, newRoom);
    this.roomCodeMap.set(code, id); // 방 코드와 ID 매핑
    this.userRoomMap.set(managerSocketId, id); // 개설자 소켓 ID와 방 ID 매핑
    console.log(
      `[ClassroomService] Room Created: ${name} (${code}), Manager: ${managerName} (${managerId})`,
    );
    return newRoom;
  }

  // 초대 코드로 방 존재 여부 확인
  findRoomByCode(code: string): Classroom | undefined {
    console.log('🔍 [ClassroomService] 찾으려는 코드:', code);
    console.log('🔍 [ClassroomService] 전체 방 목록:', Array.from(this.roomCodeMap.keys()));
    const classroomId = this.roomCodeMap.get(code); // 방 코드로 방 ID 찾기
    console.log(`[ClassroomService] Finding room by code: ${code} -> ${classroomId}`);
    return classroomId ? this.roomData.get(classroomId) : undefined; // 방 ID로 방 정보 찾기
  }

  //방 참가
  joinRoom(
    code: string,
    userId: string,
    userName: string,
    socketId: string,
    server: Server,
  ): Classroom {
    const room = this.findRoomByCode(code); // 방 찾기
    if (!room || room === undefined) throw new WsException('존재하지 않는 방입니다.'); // 방이 존재하지 않으면 에러

    const isManager = room.managerId === userId; // 참가자가 개설자인지 확인

    // 방이 유예기간인지 확인
    if (this.isGracePeriodActive(room.id)) {
      // 유예기간 중에는 오직 해당 방의 개설자만 재접속 가능
      if (!isManager) {
        throw new WsException('개설자가 일시적으로 자리를 비웠습니다. 잠시 후 다시 시도해주세요.');
      } // 개설자가 재접속하는 경우는 이 검사를 통과하여 아래 로직으로 진행됩니다.
      console.log(`[ClassroomService] Manager ${userName} is rejoining during grace period.`);
    } else {
      // 방이 정상 상태일 때
      // 개설자가 아닌 경우에만 만석 체크
      if (!isManager && room.state === 'full') {
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
      console.log(
        `[ClassroomService] User ${userId} is rejoining. Removing old socket ${oldSocketId}.`,
      );
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
    console.log(
      `[ClassroomService] User ${userName} (${userId}) joined room ${code} with socket ${socketId}.`,
    );

    if (room.participants.size >= 4) room.state = 'full';

    return room;
  }

  // 소켓 연결 해제 시(문제나 오류로 인한 연결 해제 시 메모리 정리)
  removeUserOnDisconnect(
    socketId: string,
    server: Server,
  ): {
    room: Classroom;
    leftUser: Participant;
    wasManager: boolean;
    roomTerminated: boolean;
  } | null {
    const classroomId = this.userRoomMap.get(socketId);
    if (!classroomId) return null; // 방에 참가하지 않은 경우

    const room = this.roomData.get(classroomId);
    if (!room) return null; // 방이 존재하지 않는 경우

    const leftUser = room.participants.get(socketId);
    if (!leftUser) return null; // 참가자가 방에 없는 경우

    // 메모리에서 사용자 제거
    room.participants.delete(socketId);
    this.userRoomMap.delete(socketId); // 사용자-방 매핑에서 제거
    console.log(
      `[ClassroomService] User ${leftUser.userName} (socket: ${socketId}) disconnected from room ${room.id}.`,
    );

    const wasManager = room.managerId === leftUser.userId; // 방장이었는지 확인
    let roomTerminated = false;

    if (wasManager) {
      // 개설자일 경우 유예기간 시작
      console.log(
        `[ClassroomService] Manager ${leftUser.userName} disconnected. Starting grace period for room ${room.id}.`,
      );
      room.managerSocketId = null;
      room.state = 'grace_period';
      this.startManagerGracePeriod(classroomId, leftUser.userId, server);
    } else if (room.participants.size === 0) {
      // 일반 사용자가 마지막으로 나간 경우, 방 즉시 삭제
      console.log(
        `[ClassroomService] Room ${classroomId} is now empty. Deleting room immediately.`,
      );
      this.terminateRoomImmediately(classroomId, server, this.userRoomMap).catch((error) => {
        console.error(`[ClassroomService] Error terminating room ${classroomId}:`, error);
      });
      roomTerminated = true;
    }
    return { room, leftUser, wasManager, roomTerminated };
  }

  // 방 퇴장
  async leaveRoom(roomCode: string, userId: string, socketId: string, server: Server) {
    const classroomId = this.roomCodeMap.get(roomCode);
    if (!classroomId) throw new WsException('존재하지 않는 방입니다.'); // 방 코드가 존재하지 않으면 에러

    const room = this.roomData.get(classroomId);
    if (!room) throw new WsException('존재하지 않는 방입니다.'); // 방이 존재하지 않으면 에러

    // 나가는 사람이 개설자인 경우: 즉시 방 종료
    if (room.managerId === userId) {
      await this.terminateRoomImmediately(classroomId, server, this.userRoomMap).catch((error) => {
        console.error(`[ClassroomService] Error terminating room ${classroomId}:`, error);
      });
      return { success: true, message: '방이 삭제되었습니다!' };
    } else {
      // 일반 참가자인 경우
      room.participants.delete(socketId); // 참가자 목록에서 제거
      this.userRoomMap.delete(socketId); // 사용자-방 매핑에서 제거
      const remainingParticipants = Array.from(room.participants.values());

      if (room.participants.size === 0) {
        // 마지막 참여자가 명시적으로 나간 경우에도 방 종료
        this.terminateRoomImmediately(classroomId, server, this.userRoomMap).catch((error) => {
          console.error(`[ClassroomService] Error terminating room ${classroomId}:`, error);
        });
        return {
          success: true,
          message: '마지막 참여자가 나가 방이 삭제되었습니다.',
          remainingParticipants: [],
        };
      }
      if (room.participants.size < 4 && room.state === 'full') {
        room.state = 'wait';
      }
      return {
        success: true,
        message: '방을 성공적으로 나갔습니다!',
        participants: remainingParticipants,
        state: room.state,
      };
    }
  }

  // 유예 기간이 활성화되어 있는지 확인
  isGracePeriodActive(classroomId: string): boolean {
    return this.roomRecoveryTimers.has(classroomId);
  }

  // 유예 기간 시작
  startManagerGracePeriod(classroomId: string, managerId: string, server: Server) {
    console.log(
      `[ClassroomService] Starting ${MANAGER_RECONNECT_TIMEOUT / 1000}s grace period for manager ${managerId} in room ${classroomId}.`,
    );
    const timerId = setTimeout(() => {
      const room = this.roomData.get(classroomId);
      // 유예 기간 만료 시, 여전히 개설자가 재접속하지 않았는지 최종 확인
      if (room && this.isGracePeriodActive(classroomId)) {
        console.log(
          `[ClassroomService] Grace period expired for room ${classroomId}. Terminating.`,
        );
        // Promise를 명시적으로 처리
        this.terminateRoomImmediately(classroomId, server, this.userRoomMap)
          .then(() => {
            console.log(`[ClassroomService] Room ${classroomId} terminated after grace period.`);
          })
          .catch((error) => {
            console.error(`[ClassroomService] Error terminating room ${classroomId}:`, error);
          });
      }
      this.roomRecoveryTimers.delete(classroomId);
    }, MANAGER_RECONNECT_TIMEOUT);
    this.roomRecoveryTimers.set(classroomId, timerId);
  }

  // --- 명시적 즉시 방 삭제 메소드 ---
  async terminateRoomImmediately(
    classroomId: string,
    server: Server,
    userRoomMap: Map<string, string>,
  ) {
    const room = this.roomData.get(classroomId);
    if (!room) return false;

    console.log(`[ClassroomService] Terminating room ${classroomId} immediately.`);

    // 1. 유예 기간 타이머 정리
    if (this.roomRecoveryTimers.has(classroomId)) {
      clearTimeout(this.roomRecoveryTimers.get(classroomId));
      this.roomRecoveryTimers.delete(classroomId);
    }

    // 2. 클라이언트에 즉시 알림
    server.to(room.code).emit(events.CLASSROOM_DELETED, {
      classroomId: room.id,
      message: `강의실이 종료되었습니다.`,
    });

    // 3. 소켓에서 방 제거
    const socketsInRoom = await server.in(room.code).fetchSockets();
    socketsInRoom.forEach((sock) => sock.leave(room.code));

    // 4. 메모리 정리
    for (const socketId of room.participants.keys()) {
      userRoomMap.delete(socketId);
    }
    this.roomCodeMap.delete(room.code);
    this.roomData.delete(classroomId);

    // 5. 이벤트 발행
    this.eventEmitter.emit('room.deleted', { roomId: classroomId });

    // 6. DB 삭제는 백그라운드에서 처리 (실패해도 서비스 지속)
    void this.deleteRoomFromDBAsync(classroomId, room.id);

    return true;
  }

  // DB 삭제 전용 메서드
  private async deleteRoomFromDBAsync(classroomId: string, roomId: string) {
    try {
      const { error: rpcError } = await this.supabase.rpc('handle_delete_classroom', {
        target_classroom_id: classroomId,
      });

      if (rpcError) {
        throw rpcError;
      }
      console.log(`[ClassroomService] Classroom ${roomId} deleted from DB successfully.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ClassroomService] DB delete error for ${roomId}: ${errorMessage}`);
    }
  }

  // --- 활동 관련 메소드 ---
  // socketId로 방 ID를 찾는 헬퍼 메소드
  getRoomIdBySocketId(socketId: string): string | undefined {
    return this.userRoomMap.get(socketId);
  }

  // 방 ID로 방 정보 찾기
  getRoomById(classroomId: string): Classroom | undefined {
    return this.roomData.get(classroomId); // 방 ID로 방 정보 찾기
  }
}
