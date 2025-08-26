import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthenticatedUser } from 'src/types/socket.types';

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
  // _context, status는 사용하지 않음,eslint에서 never used 경고

  // eslint에 _무시 조건 추가 필요
  /* .eslintrc.js 또는 .eslintrc.json
{
  "rules": {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { 
        "argsIgnorePattern": "^_",  //  _로 시작하는 매개변수 무시
        "varsIgnorePattern": "^_"   //  _로 시작하는 변수 무시
      }
    ]
  }
    */

  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: unknown,
    info: unknown,
    _context?: ExecutionContext,
    status?: unknown,
  ): TUser {
    if (err) {
      throw err instanceof Error ? err : new WsException('인증 중 오류가 발생했습니다.');
    }

    if (!user) {
      const infoObj = info as { message?: string };
      const errorMessage = infoObj?.message || '인증되지 않은 사용자입니다.';
      throw new WsException(errorMessage);
    }

    const authenticatedUser = user as AuthenticatedUser;
    if (!authenticatedUser.userId || !authenticatedUser.userName) {
      throw new WsException('사용자 정보가 올바르지 않습니다.');
    }
    // 인증이 성공했을 때 JwtStrategy에서 반환된 사용자 정보(user)를 반환
    // NestJS는 이 user 객체를 소켓의 'user' 속성에 저장 (client.user)
    return authenticatedUser as TUser;
  }
}
