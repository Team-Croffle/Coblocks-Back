import { Module } from '@nestjs/common';
import { ClassroomGateway } from './classroom.gateway';
import { ClassroomService } from './classroom.service';

@Module({
  providers: [ClassroomGateway, ClassroomService]
})
export class ClassroomModule {}
