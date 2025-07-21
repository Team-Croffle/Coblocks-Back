import { UseFilters } from '@nestjs/common';
import { MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WebsocketExceptionFilter } from 'src/websocket-exception/websocket-exception.filter';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseFilters(WebsocketExceptionFilter) // WebSocket 예외 필터 사용
export class ActivityGateway {
  @WebSocketServer()
  server: Socket;

  @SubscribeMessage('message')
  handleMessage(@MessageBody() payload: any): string {
    return 'Hello world!';
  }
}
