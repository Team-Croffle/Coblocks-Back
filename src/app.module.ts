import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClassroomModule } from './classroom/classroom.module';

@Module({
  imports: [ClassroomModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
