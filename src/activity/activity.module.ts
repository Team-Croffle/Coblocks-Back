import { Module } from '@nestjs/common';
import { ActivityGateway } from './activity.gateway';
import { ActivityService } from './activity.service';
import { ClassroomModule } from 'src/classroom/classroom.module';
import { ManagerGuard } from 'src/auth/manager/manager.guard';

@Module({
  imports: [ClassroomModule],
  providers: [ActivityGateway, ActivityService, ManagerGuard]
})
export class ActivityModule {}
