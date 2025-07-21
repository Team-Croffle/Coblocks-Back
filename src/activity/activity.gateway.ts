import { UseFilters } from '@nestjs/common';
import { MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WebsocketExceptionFilter } from 'src/websocket-exception/websocket-exception.filter';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@UseFilters(WebsocketExceptionFilter) // WebSocket 예외 필터 사용
export class ActivityGateway {
  @WebSocketServer()
  server: Socket;

  @SubscribeMessage('activity:editor-change')
  handleEditorChange(@MessageBody() payload: any): string {
    return 'editorContentChange';
  }

  @SubscribeMessage('activity:problem-set-select')
  handleProblemSetSelect(@MessageBody() payload: any): string {
    return 'selectProblemSet';
  }

  @SubscribeMessage('activity:start')
  handleStart(@MessageBody() payload: any): string {
    return 'startActivity';
  }

  @SubscribeMessage('activity:solution-submit')
  handleSolutionSubmit(@MessageBody() payload: any): string {
    return 'submitSolution';
  }

  @SubscribeMessage('activity:final-submit')
  handleFinalSubmit(@MessageBody() payload: any): string {
    return 'requestFinalSubmission';
  }

  @SubscribeMessage('activity:end')
  handleEnd(@MessageBody() payload: any): string {
    return 'requestEndActivity';
  }
}
