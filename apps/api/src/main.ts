import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));

  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(prefix);

  const isProd = config.get<string>('NODE_ENV') === 'production';
  const publicUrl = config.get<string>('PUBLIC_APP_URL');
  let configured = (config.get<string>('CORS_ORIGINS') ?? publicUrl ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (isProd && configured.includes('*')) {
    configured = configured.filter((o) => o !== '*');
    if (publicUrl) configured.push(new URL(publicUrl).origin);
  }
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (configured.includes(origin)) return callback(null, true);
      if (publicUrl) {
        try {
          if (new URL(publicUrl).origin === origin) return callback(null, true);
        } catch {
          /* ignore */
        }
      }
      try {
        const url = new URL(origin);
        const host = url.hostname;
        const isLoopback = host === 'localhost' || host === '127.0.0.1';
        const isQuickTunnel =
          host.endsWith('.trycloudflare.com') ||
          host.endsWith('.cfargotunnel.com') ||
          host.endsWith('.ngrok-free.app') ||
          host.endsWith('.ngrok.io');
        if (isLoopback || isQuickTunnel) return callback(null, true);
        if (!isProd) {
          const isLocalLan =
            /^192\.168\.\d+\.\d+$/.test(host) ||
            /^10\.\d+\.\d+\.\d+$/.test(host) ||
            /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host);
          if (isLocalLan) return callback(null, true);
        }
      } catch {
        /* ignore */
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (!isProd) {
    const swagger = new DocumentBuilder()
      .setTitle('EITF HRMS API')
      .setDescription('Enterprise HRMS & Payroll — REST API v1')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
  }

  const port = config.get<number>('API_PORT', 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://0.0.0.0:${port}/${prefix}`);
  console.log(`Health: http://127.0.0.1:${port}/${prefix}/health`);
  console.log(`Swagger at http://localhost:${port}/api/docs`);
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

bootstrap();
