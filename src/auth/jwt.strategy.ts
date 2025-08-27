import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TypedSocket } from 'src/types/socket.types';

interface JwtPayload {
  // JWT payload 타입
  sub: string; // 사용자 ID
  user_metadata: {
    nickname: string; // 사용자 닉네임
  };
}

// 클라이언트는 소켓 서버에 접속할 때 아래와 같이 auth 정보를 포함시켜야 함
/*
    const socket = io("http://localhost:3001", {
        auth: {
            token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // 로그인 시 받은 JWT
        }
    });
*/

// 소켓 연결 요청의 handshake 부분에서 토큰을 추출하는 함수
// socket.io의 타입 정의에 따라 token 타입이
const fromSocketAuth = (client: TypedSocket): string | null => {
  return client.handshake.auth.token || null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      // 1. 토큰을 추출하는 방법을 지정
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromSocketAuth, // fromSocketAuth 함수를 통해 소켓에서 토큰 추출
      ]),
      // 2. 토큰 만료를 무시할지 여부 (false로 설정하면 만료된 토큰은 거부됨)
      ignoreExpiration: false,
      // 3. 토큰 서명에 사용할 키 (Supabase와 동일해야 함)
      secretOrKey: configService.get<string>('SUPABASE_JWT_SECRET')!,
      // !는 해당 변수는 항상 존재한다고 가정(반드시 .env 파일에 정의되어 있어야 함)
    });
  }

  /**
   * 4. 토큰 검증이 성공적으로 끝나면 nestjs가 validate 메서드 호출
   * 해당 메서드에서 반환된 값은 소켓 객체의 user 속성에 저장됨
   * @param payload - JWT 토큰에 담겨있는 정보
   */
  validate(payload: JwtPayload) {
    // Supabase JWT의 payload에서 필요한 사용자 정보를 추출하여 반환
    return {
      userId: payload.sub, // 'sub'는 Supabase에서 사용자 ID를 나타냄
      userName: payload.user_metadata?.nickname, // 사용자 메타데이터에서 nickname(username) 추출
    };
  }
}
