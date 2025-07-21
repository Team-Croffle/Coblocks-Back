import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ClassroomModule } from '../classroom/classroom.module';

@Module({
    imports: [ClassroomModule],
    providers: [ChatGateway],
})
export class ChatModule {}
