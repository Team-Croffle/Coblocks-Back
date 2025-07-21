import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClassroomModule } from './classroom/classroom.module';
import { ChatGateway } from './chat/chat.gateway';
import { ChatModule } from './chat/chat.module';
import { ActivityModule } from './activity/activity.module';
import { AcivityService } from './acivity/acivity.service';

@Module({
  imports: [ClassroomModule, ChatModule, ActivityModule],
  controllers: [AppController],
  providers: [AppService, ChatGateway, AcivityService],
})
export class AppModule {}
