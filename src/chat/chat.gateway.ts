import { ConnectedSocket, SubscribeMessage, MessageBody ,WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {WebsocketExceptionFilter } from '../websocket-exception/websocket-exception.filter';
import { UseFilters } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ClassroomService } from 'src/classroom/classroom.service';
import { SendMessageDto } from './chatDto/sendMessage.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseFilters(WebsocketExceptionFilter) // WebSocket 예외 필터 사용
export class ChatGateway {
  constructor(private readonly classroomService: ClassroomService) {}

  @WebSocketServer()
  server: Server;


  @SubscribeMessage('sendMessage')
  handleMessage(@MessageBody() messageData: SendMessageDto, @ConnectedSocket() client: Socket) {
    const message = {
      username: messageData.username,
      message: messageData.message,
      timestamp: new Date().toISOString(),
    }

    const room = this.classroomService.findRoomByCode(messageData.roomCode);
    if (!room) {
      throw new WsException('존재하지 않는 방입니다.');
    }

    this.server.to(messageData.roomCode).emit('message', message);
    return { success: true, message: 'Message sent successfully' };
  }
}
