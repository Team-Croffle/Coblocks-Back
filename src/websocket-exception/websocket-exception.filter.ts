import { ArgumentsHost, Catch, WsExceptionFilter } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Catch()
export class WebsocketExceptionFilter implements WsExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();
    const data = host.switchToWs().getData();

    // 에러 메시지 포맷 지정
    const message =
      exception instanceof WsException
        ? exception.getError()
        : exception.message || '알 수 없는 에러가 발생했습니다';

    // 클라이언트에 에러 메시지 전송
    client.emit('error', { success: false, message, data });
  }
}
