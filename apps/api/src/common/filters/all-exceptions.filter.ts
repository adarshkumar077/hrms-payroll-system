import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { sanitizeForLog, sanitizeLogMessage } from '../sanitize-log.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: { id?: string } }>();

    const requestId = randomUUID().slice(0, 8);
    const userId = req.user?.id ?? 'anonymous';
    const path = req.url;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object' && 'message' in body) {
        const m = (body as { message: string | string[] }).message;
        message = Array.isArray(m) ? m.join(', ') : m;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception);
      status = mapped.status;
      message = mapped.message;
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid request.';
    } else if (exception instanceof Error) {
      if (/ENOENT|file not found/i.test(exception.message)) {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found.';
      } else if (/ECONNREFUSED|ETIMEDOUT|connection/i.test(exception.message)) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Database temporarily unavailable.';
      }
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      message = message || 'Session expired.';
    } else if (status === HttpStatus.FORBIDDEN) {
      message = message || 'Permission denied.';
    } else if (status === HttpStatus.NOT_FOUND) {
      message = message || 'Record not found.';
    } else if (status === HttpStatus.BAD_REQUEST) {
      message = message || 'Invalid request.';
    } else if (status >= 500) {
      message = 'Something went wrong. Please try again.';
    }

    const stack = exception instanceof Error ? exception.stack : String(exception);
    const logPayload = sanitizeForLog({
      requestId,
      userId,
      path,
      method: req.method,
      status,
      message: exception instanceof Error ? sanitizeLogMessage(exception.message) : exception,
    }) as Record<string, unknown>;
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      this.logger.warn(JSON.stringify(logPayload));
    } else if (status >= 500) {
      this.logger.error(JSON.stringify({ ...logPayload, stack }));
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    res.status(status).json({
      statusCode: status,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path,
    });
  }

  private mapPrismaError(error: Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        const field = target[0] ?? '';
        const messages: Record<string, string> = {
          employee_code: 'Employee Code already exists. Please enter a unique Employee Code.',
          login_id: 'This Employee Code is already used as a login ID. Choose a different code.',
          email: 'This email or username is already registered. Use a different value.',
          mobile: 'This mobile number is already registered. Use a different mobile number.',
        };
        return {
          status: HttpStatus.CONFLICT,
          message:
            messages[field] ??
            (field
              ? `A record with this ${field.replace(/_/g, ' ')} already exists.`
              : 'A record with this value already exists.'),
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found.',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid reference — related record not found.',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid request — relationship constraint failed.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database temporarily unavailable.',
        };
    }
  }
}
