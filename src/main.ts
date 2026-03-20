import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enables DTO validation globally across all endpoints
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips fields not in DTO
      forbidNonWhitelisted: true, // throws error if extra fields sent
      transform: true, // auto-transforms types
    }),
  );

  await app.listen(3000);
  console.log('🚀 Server running on http://localhost:3000');
}
bootstrap();
