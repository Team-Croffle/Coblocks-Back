import { IsString, IsUUID } from 'class-validator';

export class JoinClassroomDto {
  @IsString()
  code: string; // 방 코드

  @IsUUID()
  userId: string; // 사용자 ID

  @IsString()
  userName: string; // 사용자 이름
}
