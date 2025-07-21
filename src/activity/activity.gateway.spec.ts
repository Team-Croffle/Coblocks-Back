import { Test, TestingModule } from '@nestjs/testing';
import { ActivityGateway } from './activity.gateway';

describe('ActivityGateway', () => {
  let gateway: ActivityGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivityGateway],
    }).compile();

    gateway = module.get<ActivityGateway>(ActivityGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
