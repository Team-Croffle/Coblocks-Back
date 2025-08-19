import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ClassroomService } from 'src/classroom/classroom.service';

@Injectable()
export class ManagerGuard implements CanActivate {
  //생성자에서 ClassroomService를 주입받아 사용
  constructor(private readonly classroomService: ClassroomService) {}

  canActivate(context: ExecutionContext): boolean {
    console.log('[ManagerGuard] 방장 권한 체크 시작'); // for test

    // 현재 요청에 대한 소켓(client)객체 가져오기
    const client: Socket = context.switchToWs().getClient<Socket>();

    // 소켓에 저장된 사용자 정보 가져오기
    const user = (client as any).user;

    if (!user || !user.userId) {
      console.log('[ManagerGuard] 사용자 정보가 없습니다 (Not Authenticated).');
      throw new WsException('사용자 정보를 확인할 수 없습니다 (Not Authenticated).');
    }

    const userId = user.userId; // JWT에서 설정된 위치

    // 해당 소켓이 속한 방 정보 가져오기
    const classroomId = this.classroomService.getRoomIdBySocketId(client.id);
    if (!classroomId) {
      console.log('[ManagerGuard] 참여중인 강의실이 없습니다 (No Active Classroom).');
      throw new WsException('참여중인 강의실이 없습니다.');
    }
    const room = this.classroomService.getRoomById(classroomId);

    if (!room) {
      console.log('[ManagerGuard] 방 정보가 없습니다 (Room Not Found).');
      throw new WsException('강의실 정보를 찾을 수 없습니다 (Room Not Found).');
    }

    if (room.managerId !== userId) {
      console.log('[ManagerGuard] 방장 권한이 없습니다 (Not Room Manager).');
      throw new WsException('개설자만 사용할 수 있는 기능입니다.');
    }
    (client as any).room = room; // 소켓에 방 정보 저장
    return true; // 권한이 있는 경우 true 반환
  }
}
