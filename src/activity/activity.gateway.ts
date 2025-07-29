import { UseFilters, UseGuards } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { WebsocketExceptionFilter } from 'src/websocket-exception/websocket-exception.filter';
import { ActivityService } from './activity.service';
import { ManagerGuard } from 'src/auth/manager/manager.guard';
import { SelectProblemDto } from './activityDto/SelectProblem.dto';
import { SubmitSolutionDto } from './activityDto/SubmitSolution.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard) // JWT 인증 가드 사용
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseFilters(WebsocketExceptionFilter) // WebSocket 예외 필터 사용
export class ActivityGateway {
  constructor(private readonly activityService: ActivityService) {}

  @WebSocketServer()
  server: Server;

  // 방장 권한이 필요한 이벤트 핸들러

  @UseGuards(ManagerGuard) // 방장 권한 확인 가드 사용
  @SubscribeMessage('activity:problem-set-select')
  async handleProblemSetSelect(@ConnectedSocket() client: Socket , @MessageBody() data: SelectProblemDto) {
    return this.activityService.selectProblemSet(client, this.server, data);
  }

  @UseGuards(ManagerGuard) // 방장 권한 확인 가드 사용
  @SubscribeMessage('activity:start')
  handleStart(@ConnectedSocket() client: Socket) {
    return this.activityService.startActivity(client, this.server,);
  }

  @UseGuards(ManagerGuard) // 방장 권한 확인 가드 사용
  @SubscribeMessage('activity:final-submit')
  handleFinalSubmit(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    return this.activityService.requestFinalSubmission(client, this.server, data);
  }

  @UseGuards(ManagerGuard) // 방장 권한 확인 가드 사용
  @SubscribeMessage('activity:end')
  handleEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { roomCode: string}) {
    return this.activityService.endActivity(client, this.server, data);
  }

  // 공용 핸들러

  @SubscribeMessage('activity:solution-submit')
  handleSolutionSubmit(@MessageBody() data: SubmitSolutionDto, @ConnectedSocket() client: Socket) {
    return this.activityService.submitSolution(client, this.server, data);
  }
}
