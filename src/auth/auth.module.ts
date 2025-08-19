import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('SUPABASE_JWT_SECRET')!, // JWT 토큰을 서명할 비밀 키 (JwtStrategy와 동일해야 함)
        signOptions: { expiresIn: '2h' }, // JWT 토큰의 유효 기간 설정
      }),
      inject: [ConfigService], // ConfigService를 주입하여 환경 변수 사용
    }),
  ],
  // 모듈에서 사용할 provider(service, guard)등록
  providers: [JwtStrategy, JwtAuthGuard],
  // 선택: 다른 모듈에서 JwtAuthGuard를 사용하려면 exports에 추가
  // exports: [JwtAuthGuard],
})
export class AuthModule {}
