import { Module } from '@nestjs/common';
import { ClassroomGateway } from './classroom.gateway';

@Module({
  providers: [ClassroomGateway]
})
export class ClassroomModule {}
