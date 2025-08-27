import { UseFilters, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { WebsocketExceptionFilter } from 'src/websocket-exception/websocket-exception.filter';
import { ActivityService } from './activity.service';
import { ManagerGuard } from 'src/auth/manager/manager.guard';
import { SelectProblemDto } from './activityDto/SelectProblem.dto';
import { SubmitSolutionDto } from './activityDto/SubmitSolution.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { events } from 'src/utils/events';
/**
 * UseGuards(JwtAuthGuard) - JWT 인증 가드 사용중
 * UseGuards(ManagerGuard) - 방장 권한 확인 가드 사용중
 */

@UseGuards(JwtAuthGuard)
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

  @UseGuards(ManagerGuard)
  @SubscribeMessage(events.ACTIVITY_SELECT_PROBLEM)
  async handleProblemSetSelect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SelectProblemDto,
  ) {
    return this.activityService.selectProblemSet(client, this.server, data);
  }

  @UseGuards(ManagerGuard)
  @SubscribeMessage(events.ACTIVITY_START)
  handleStart(@ConnectedSocket() client: Socket) {
    return this.activityService.startActivity(client, this.server);
  }

  @UseGuards(ManagerGuard)
  @SubscribeMessage(events.ACTIVITY_FINAL_SUBMIT)
  handleFinalSubmit(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    return this.activityService.requestFinalSubmission(client, this.server, data);
  }

  @UseGuards(ManagerGuard)
  @SubscribeMessage(events.ACTIVITY_END)
  handleEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { code: string }) {
    return this.activityService.endActivity(client, this.server, data);
  }

  // 공용 핸들러

  @SubscribeMessage(events.ACTIVITY_SUBMIT_SOLUTION)
  handleSolutionSubmit(@MessageBody() data: SubmitSolutionDto, @ConnectedSocket() client: Socket) {
    return this.activityService.submitSolution(client, this.server, data);
  }
}
