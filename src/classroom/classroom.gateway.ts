import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { ClassroomService } from './classroom.service';

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
    console.log(`Client disconnected: ${client.id}`);
  }

  // 소켓 연결에 성공한 사용자가 방을 개설할 때 호출되는 메서드
  @SubscribeMessage('createRoom')
  handleCreateRoom(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const { id, code, managerId } = data; // 클라이언트로부터 받은 데이터
    const managerSocketId = client.id; // 개설자 소켓 ID
    try {
      const newRoom = this.classroomService.createRoom(id, code, managerId, managerSocketId);
      client.join(code); // 방에 참가
      client.emit('roomCreated', newRoom); // 방 생성 성공 응답
    } catch (error) {
      client.emit('error', { message: error.message }); // 에러 발생 시 클라이언트에 에러 메시지 전송
    }
  }
}
