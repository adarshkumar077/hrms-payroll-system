import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { isCorsOriginAllowed, parseTrustProxy } from './common/cors-origin';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  // Required so req.ip reflects the real client behind a reverse proxy (not a spoofable header).
  app.getHttpAdapter().getInstance().set('trust proxy', parseTrustProxy(config.get<string>('TRUST_PROXY')));

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
  const corsOrigins = config.get<string>('CORS_ORIGINS');
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (isCorsOriginAllowed(origin, { isProd, corsOrigins, publicAppUrl: publicUrl })) {
        return callback(null, true);
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
  if (!isProd) console.log(`Swagger at http://localhost:${port}/api/docs`);
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

bootstrap();
