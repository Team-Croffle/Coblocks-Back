import { Test, TestingModule } from '@nestjs/testing';
import { ClassroomGateway } from './classroom.gateway';

describe('ClassroomGateway', () => {
  let gateway: ClassroomGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassroomGateway],
    }).compile();

    gateway = module.get<ClassroomGateway>(ClassroomGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
