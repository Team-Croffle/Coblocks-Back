import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Passport } from 'passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
    imports: [
        PassportModule,
        JwtModule.register({
            secret: process.env.SUPABASE_JWT_SECRET!, // JWT 토큰을 서명할 비밀 키 (JwtStrategy와 동일해야 함)
            signOptions: { expiresIn: '2h' }, // JWT 토큰의 유효 기간 설정
        }),
    ],
    // 모듈에서 사용할 provider(service, guard)등록
    providers: [JwtStrategy, JwtAuthGuard],
    // 선택: 다른 모듈에서 JwtAuthGuard를 사용하려면 exports에 추가
    // exports: [JwtAuthGuard],
})
export class AuthModule {}
