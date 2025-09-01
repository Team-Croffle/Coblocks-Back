import { Module } from '@nestjs/common';
import { ClassroomGateway } from './classroom.gateway';
import { ClassroomService } from './classroom.service';
import { SupabaseModule } from 'src/database/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [ClassroomGateway, ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
