import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClassroomModule } from './classroom/classroom.module';
import { ChatGateway } from './chat/chat.gateway';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [ClassroomModule, ChatModule],
  controllers: [AppController],
  providers: [AppService, ChatGateway],
})
export class AppModule {}
