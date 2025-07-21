import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import {WebsocketExceptionFilter } from '../websocket-exception/websocket-exception.filter';

@WebSocketGateway()
export class ChatGatewayGateway {
  @SubscribeMessage('message')
  handleMessage(client: any, payload: any): string {
    return 'Hello world!';
  }
}
