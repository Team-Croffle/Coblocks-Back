import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClassroomModule } from './classroom/classroom.module';
import { ChatGatewayGateway } from './chat-gateway/chat-gateway.gateway';

@Module({
  imports: [ClassroomModule],
  controllers: [AppController],
  providers: [AppService, ChatGatewayGateway],
})
export class AppModule {}
