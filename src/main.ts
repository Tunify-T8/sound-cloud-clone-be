import dns from 'dns';
dns.setDefaultResultOrder('ipv4first'); // prefer IPv4 over IPv6

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // serve uploads folder as static files
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // serve API docs (ReDoc)
  app.useStaticAssets(path.join(process.cwd()), {
    prefix: '/',
  });

  // ─── CORS ──────────────────────────────────────────────────────
  app.enableCors({
    origin: [
      'https://tunify.duckdns.org', // Azure production
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // local WS testing
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ─── Global Validation ─────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true, // auto-transform payloads to DTO types
    }),
  );

  // ─── WebSocket Adapter ─────────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
}

bootstrap();
