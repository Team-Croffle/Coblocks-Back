import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { ClassroomService } from './classroom.service';
import { CreateClassroomDto } from './classroomDto/create-classroom.dto';
import { JoinClassroomDto } from './classroomDto/join-classroom.dto';
import { UseFilters, UseGuards } from '@nestjs/common';
import { WebsocketExceptionFilter } from '../websocket-exception/websocket-exception.filter';
import { events } from 'src/utils/events';
import { getSocketUser } from 'src/types/socket.types';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseFilters(WebsocketExceptionFilter) // WebSocket 예외 필터 사용
export class ClassroomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly classroomService: ClassroomService) {}

  // 서버로부터 클라이언트로 이벤트를 전송할 수 있는 서버 인스턴스를 가져옴
  @WebSocketServer()
  server: Server;

  // 클라이언트가 접속할 때 호출되는 메서드
  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`); // 테스트를 위한 로그 출력
  }

  // 클라이언트의 연결이 끊어질 때 호출되는 메서드
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    // ClassroomService를 통해 연결 끊김 처리
    const result = this.classroomService.removeUserOnDisconnect(client.id, this.server);

    if (result) {
      const { room, leftUser, wasManager, roomTerminated } = result;

      // 방이 즉시 종료된 경우, 추가 이벤트 불필요
      if (roomTerminated) {
        console.log(
          `[ClassroomGateway] Room ${room.id} has been terminated due to manager disconnection.`,
        );
        return;
      }

      // 방이 유지되는 경우
      const remainingParticipants = Array.from(room.participants.values());

      this.server.to(room.code).emit(events.CLASSROOM_USER_LEFT, {
        leftUser: leftUser.userName,
        users: remainingParticipants.map((p) => ({ userName: p.userName })),
        userCount: remainingParticipants.length,
        isManagerLeftTemporarily: wasManager,
      });
    }
  }

  // 소켓 연결에 성공한 사용자가 방을 개설할 때 호출되는 메서드
  @SubscribeMessage(events.CLASSROOM_CREATE)
  async handleCreateRoom(
    @MessageBody() data: CreateClassroomDto,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(
      `[ClassroomGateway] Create room request from user ${data.managerId} with code ${data.code}.`,
    );

    const newRoom = this.classroomService.createRoom(
      data.id,
      data.name,
      data.code,
      data.managerId,
      client.id,
      data.managerName,
    ); // 방 생성

    // // 테스트용 설정 -> JWT토큰으로 교체 예정 (중단)
    // client.data.userId = data.managerId; // 소켓에 사용자 ID 저장
    // client.data.userName = data.managerName; // 소켓에 사용자 이름 저장

    await client.join(newRoom.code); // 방에 참가

    return {
      success: true,
      message: '방이 성공적으로 개설되었습니다!',
      classroom: { name: newRoom.name, code: newRoom.code }, // 클라이언트 UI 업데이트를 위한 방 정보
      users: Array.from(newRoom.participants.values()).map((p) => ({ userName: p.userName })), // 참가자 목록
      isManager: true, // 개설자 권한 여부
      state: newRoom.state, // 방 상태
    }; // 방 개설 성공 응답
  }

  @SubscribeMessage(events.CLASSROOM_JOIN)
  async handleJoinRoom(@MessageBody() data: JoinClassroomDto, @ConnectedSocket() client: Socket) {
    const room = this.classroomService.joinRoom(
      data.code,
      data.userId,
      data.userName,
      client.id,
      this.server, // 이전 소켓 강제 종료를 위해 서버 인스턴스를 전달(중복 방 참가 방지)
    ); // 방 참가

    // 테스트용 설정 -> JWT토큰으로 교체 예정 (중단)
    // client.data.userId = data.userId; // 소켓에 사용자 ID 저장
    // client.data.userName = data.userName; // 소켓에 사용자 이름 저장

    await client.join(room.code); // 방에 참가

    const participants = Array.from(room.participants.values());

    client.to(room.code).emit(events.CLASSROOM_USER_JOINED, {
      joinUser: data.userName,
      users: participants.map((p) => ({ userName: p.userName })),
      userCount: participants.length,
    });

    return {
      success: true,
      message: '방에 입장했습니다!',
      classroom: { name: room.name, code: room.code },
      users: participants.map((p) => ({ userName: p.userName })),
      isManager: room.managerId === data.userId,
      roomState: room.state,
      isGracePeriod: this.classroomService.isGracePeriodActive(room.id),
    }; // 방 참가 성공 응답
  }

  // 방 나가기 요청 처리(명시적 퇴장 요청)
  @SubscribeMessage(events.CLASSROOM_LEAVE)
  async handleLeaveRoom(@MessageBody() data: { code: string }, @ConnectedSocket() client: Socket) {
    const user = getSocketUser(client); // JWT 인증을 통해 사용자 정보 가져오기 (테스트 필요 작성 기준 - 8/4)
    console.log(`[ClassroomGateway] leaveRoom request from ${user.userId} for room ${data.code}`);

    const result = await this.classroomService.leaveRoom(
      data.code,
      user.userId,
      client.id,
      this.server,
    );

    if (result.success) {
      // 방이 종료된 경우 추가 이벤트 불필요 (leaveRoom 내부의 terminateRoomImmediately 호출로 처리됨)
      console.log(
        `[ClassroomGateway] Room ${data.code} terminated by explicit leave of user ${user.userId}.`,
      );
    } else {
      // 일반 참가자 퇴장
      const remainingParticipants = result.participants;
      if (!remainingParticipants) {
        console.error(
          `[ClassroomGateway] No remaining participants found after leaving room ${data.code}.`,
        );
        return { success: false, message: '방에 참가자가 없습니다.' };
      }

      client.to(data.code).emit(events.CLASSROOM_USER_LEFT, {
        leftUser: user.userName,
        users: remainingParticipants.map((p) => ({ userName: p.userName })),
        userCount: remainingParticipants.length,
        isManagerLeftTemporarily: false,
      });
    }

    return {
      success: true,
      message: '방을 성공적으로 나갔습니다!',
    };
  }
}
