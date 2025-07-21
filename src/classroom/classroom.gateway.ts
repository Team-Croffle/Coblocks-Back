import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { ClassroomService } from './classroom.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { JoinClassroomDto } from './dto/join-classroom.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ClassroomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly classroomService: ClassroomService) {}

  // 서버로부터 클라이언트로 이벤트를 전송할 수 있는 서버 인스턴스를 가져옴
  @WebSocketServer()
  server: Server
  
  // 클라이언트가 접속할 때 호출되는 메서드
  handleConnection(client: Socket){
    console.log(`Client connected: ${client.id}`);
  }

  // 클라이언트의 연결이 끊어질 때 호출되는 메서드
  handleDisconnect(client: Socket) {
    
  }

  // 소켓 연결에 성공한 사용자가 방을 개설할 때 호출되는 메서드
  @SubscribeMessage('createRoom')
  handleCreateRoom(@MessageBody() classroom: CreateClassroomDto, @ConnectedSocket() client: Socket) {
    const { id, name, code, managerId, managername } = classroom; // 클라이언트로부터 받은 데이터
    const managerSocketId = client.id; // 개설자 소켓 ID

    try {
      const newRoom = this.classroomService.createRoom(id, name, code, managerId, managerSocketId);

      client.join(code); // 방에 참가
      newRoom.participants.push({ userId: managerId, username: managername }); // 개설자는 참가자 목록에 추가
      return { 
        success: true,
        message: '방이 성공적으로 개설되었습니다!',
        participants: newRoom.participants, // 참가자 목록
        isManager: true, // 개설자는 항상 매니저
        state: newRoom.state, // 방 상태
      }; // 방 개설 성공 응답
    } catch (error) {
      return { success: false, message: error.message }; // 에러 발생 시 클라이언트에 에러 메시지 전송
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() joinInfo: JoinClassroomDto, @ConnectedSocket() client: Socket) {
    const { code, userId, username } = joinInfo; // 클라이언트로부터 받은 데이터

    try {
      const room = this.classroomService.joinRoom(code, userId, username); // 방 참가

      if(room){
        client.join(code); // 방에 참가
      }

      client.to(code).emit('userJoined', { message: `${username}님이 방에 입장했습니다` }, room.participants, room.state); // 방에 참가한 사용자에게 알림
      
      return { 
        success: true,
        message: '방에 입장했습니다!',
        roomName: room.name,
        roomCode: room.code,
        roomParticipants: room.participants,
        roomIsManager: room.managerId === userId,
        roomState: room.state
      }; // 방 참가 성공 응답
    } catch (error) {
      return { success: false, message: error.message }; // 에러 발생 시 클라이언트에 에러 메시지 전송
    }
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(@MessageBody() data: {code: string, userId: string}, @ConnectedSocket() client: Socket) {
    console.log("나가기 요청 받음");
    // 방 찾기
      try {
        // Service에서 방 나가기 처리
        const result = this.classroomService.leaveRoom(data.code, data.userId);
          // 다른 참가자들에게 알림
        client.to(data.code).emit('userLeft', { 
           message: `${data.userId} 님이 방을 나갔습니다`
        }, result.participants, result.state);
        // 클라이언트에게 방 나가기 성공 응답
        return {
          success: true,
          message: '방을 성공적으로 나갔습니다!',
        }
      } catch (error) {
        return {success: false, message: error.message }; // 에러 발생 시 클라이언트에 에러 메시지 전송
      }
  }
}
