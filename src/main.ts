import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 글로벌 ValidationPipe 적용
  app.useGlobalPipes(new ValidationPipe());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
