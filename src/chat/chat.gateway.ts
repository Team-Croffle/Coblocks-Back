import { ConnectedSocket, SubscribeMessage, MessageBody ,WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {WebsocketExceptionFilter } from '../websocket-exception/websocket-exception.filter';
import { UseFilters, UseGuards } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ClassroomService } from 'src/classroom/classroom.service';
import { SendMessageDto } from './chatDto/sendMessage.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard) // JWT 인증 가드 사용
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
    // 
    const room = this.classroomService.findRoomByCode(messageData.code);
    if (!room) {
      throw new WsException('존재하지 않는 방입니다.');
    }
    if (!room.participants.has(client.id)) {
      throw new WsException('방에 참가하지 않은 사용자입니다.');
    }

    const message = {
      userName: messageData.userName,
      message: messageData.message,
      timestamp: new Date().toLocaleString(), // 현지 시간(날짜+시간)
    }

    this.server.to(messageData.code).emit('message', message);
    return { success: true, message: 'Message sent successfully' };
  }
}