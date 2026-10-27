import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, InternalServerErrorException, Logger, Provider } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GqlArgumentsHost, GqlContextType } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { LoggerService } from 'src/logger/logger.service';
import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { LOG_MESSAGES } from 'src/constants/log-messages';
import { RETURN_MESSAGES } from 'src/constants/return-messages';

/**
 * Last line of defence for every REST route and GraphQL resolver.
 *
 * - HttpExceptions are deliberate (thrown by services, guards or the ValidationPipe, which log them with domain
 *   context first), so they pass through unchanged.
 * - Anything else is a bug or an infrastructure failure (database down, TypeORM error...). It is logged once, with the
 *   route or GraphQL operation and the user, and the client gets a generic 500 that doesn't leak internal details.
 *
 * This is what lets services skip try/catch blocks: they only handle the failures they can do something about.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {

  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly loggerService: LoggerService) { }

  catch(exception: unknown, host: ArgumentsHost) {
    const isGraphql = host.getType<GqlContextType>() === 'graphql';
    const httpException = exception instanceof HttpException ? exception : this.handleUnexpected(exception, host, isGraphql);

    // Resolvers return the error and Apollo adds it to the `errors` array of the response.
    if (isGraphql) {
      return httpException;
    }

    const body = httpException.getResponse();
    host.switchToHttp().getResponse<Response>()
      .status(httpException.getStatus())
      .json(typeof body === 'string' ? { statusCode: httpException.getStatus(), message: body } : body);
  }

  private handleUnexpected(exception: unknown, host: ArgumentsHost, isGraphql: boolean): HttpException {
    const error = exception instanceof Error ? exception : new Error(String(exception));
    const { operation, userId } = isGraphql ? this.describeGraphqlOperation(host) : this.describeHttpRequest(host);

    this.logger.error(`${operation}: ${error.message}`, error.stack);
    void this.loggerService.error(
      LOG_MESSAGES.EXCEPTION_FILTER.UNHANDLED(operation, error.message),
      LOG_CONTEXTS.AllExceptionsFilter,
      error.stack,
      { operation, userId, errorName: error.name },
    );

    return new InternalServerErrorException({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: RETURN_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }

  // Uses the route pattern (e.g. /auth/reset-password/:userId/:token) rather than the URL, so ids and tokens aren't logged.
  private describeHttpRequest(host: ArgumentsHost): { operation: string; userId?: string } {
    const request = host.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    return { operation: `${request.method} ${request.route?.path ?? request.path}`, userId: request.user?.id };
  }

  private describeGraphqlOperation(host: ArgumentsHost): { operation: string; userId?: string } {
    const gqlHost = GqlArgumentsHost.create(host);
    const info = gqlHost.getInfo();
    const request = gqlHost.getContext().req;
    return { operation: `GraphQL ${info.parentType.name}.${info.fieldName}`, userId: request?.user?.id };
  }
}

export const allExceptionsFilterProvider: Provider = { provide: APP_FILTER, useClass: AllExceptionsFilter };
