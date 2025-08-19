import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Passport는 기본적으로 HTTP요청을 처리하도록 설계되어있기 때문에
   * 웹 소켓 요청을 처리하기 위해서는 ExecutionContext를 사용하여
   * 웹 소켓 요청을 가져와야 함
   */
  getRequest(context: ExecutionContext) {
    return context.switchToWs().getClient<Socket>();
  }

  /**
   * 인증이 실패했을 때(에러 발생 or 사용자 정보 없음) 처리할 내용 정의
   */
  handleRequest(err, user, info) {
    if (err || !user) {
      // WsException을 사용해 클라이언트에게 명확한 오류 메세지 전달
      throw err || new WsException(info?.message || '인증되지 않은 사용자입니다.');
    }
    // 인증이 성공했을 때 JwtStrategy에서 반환된 사용자 정보(user)를 반환
    // NestJS는 이 user 객체를 소켓의 'user' 속성에 저장 (client.user)
    return user;
  }
}
