import { ForbiddenException, HttpException, HttpStatus, InternalServerErrorException, Logger } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { LoggerService } from 'src/logger/logger.service';
import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { LOG_MESSAGES } from 'src/constants/log-messages';
import { RETURN_MESSAGES } from 'src/constants/return-messages';

describe('AllExceptionsFilter', () => {
  const mockLoggerService = { error: jest.fn() };
  const filter = new AllExceptionsFilter(mockLoggerService as unknown as LoggerService);

  const genericServerError = {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: RETURN_MESSAGES.INTERNAL_SERVER_ERROR,
  };

  const createHttpHost = () => {
    const request = {
      method: 'PATCH',
      path: '/label/0b7a1f2e-5f39-4a43-9d2c-1f6c1e3f9a10',
      route: { path: '/label/:id' },
      user: { id: 'user-id' },
    };
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = new ExecutionContextHost([request, response]);
    host.setType('http');
    return { host, response };
  };

  const createGraphqlHost = () => {
    const context = { req: { user: { id: 'user-id' } } };
    const info = { parentType: { name: 'Mutation' }, fieldName: 'createLabel' };
    const host = new ExecutionContextHost([{}, {}, context, info]);
    host.setType('graphql');
    return host;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('REST', () => {

    it('should pass an HttpException through unchanged without logging it', () => {
      const { host, response } = createHttpHost();
      const body = { statusCode: HttpStatus.FORBIDDEN, message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE };

      filter.catch(new ForbiddenException(body), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(response.json).toHaveBeenCalledWith(body);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should wrap a string HttpException response in the standard body', () => {
      const { host, response } = createHttpHost();

      filter.catch(new HttpException('Bad input', HttpStatus.BAD_REQUEST), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(response.json).toHaveBeenCalledWith({ statusCode: HttpStatus.BAD_REQUEST, message: 'Bad input' });
    });

    it('should return a generic 500 for an unexpected error and not leak its message', () => {
      const { host, response } = createHttpHost();

      filter.catch(new Error('SQLITE_ERROR: no such table: label'), host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(response.json).toHaveBeenCalledWith(genericServerError);
    });

    it('should log an unexpected error with the route pattern, user and stack trace', () => {
      const { host } = createHttpHost();
      const error = new TypeError('Cannot read properties of undefined');

      filter.catch(error, host);

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        LOG_MESSAGES.EXCEPTION_FILTER.UNHANDLED('PATCH /label/:id', error.message),
        LOG_CONTEXTS.AllExceptionsFilter,
        error.stack,
        { operation: 'PATCH /label/:id', userId: 'user-id', errorName: 'TypeError' },
      );
    });

    it('should handle thrown values that are not Error instances', () => {
      const { host, response } = createHttpHost();

      filter.catch('something went wrong', host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(response.json).toHaveBeenCalledWith(genericServerError);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        LOG_MESSAGES.EXCEPTION_FILTER.UNHANDLED('PATCH /label/:id', 'something went wrong'),
        LOG_CONTEXTS.AllExceptionsFilter,
        expect.any(String),
        expect.objectContaining({ errorName: 'Error' }),
      );
    });

  });

  describe('GraphQL', () => {

    it('should return an HttpException unchanged so Apollo reports it as is', () => {
      const exception = new ForbiddenException({ statusCode: HttpStatus.FORBIDDEN, message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE });

      const result = filter.catch(exception, createGraphqlHost());

      expect(result).toBe(exception);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should replace an unexpected error with a generic 500 and log the operation', () => {
      const error = new Error('SQLITE_ERROR: no such table: label');

      const result = filter.catch(error, createGraphqlHost());

      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as InternalServerErrorException).getResponse()).toEqual(genericServerError);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        LOG_MESSAGES.EXCEPTION_FILTER.UNHANDLED('GraphQL Mutation.createLabel', error.message),
        LOG_CONTEXTS.AllExceptionsFilter,
        error.stack,
        { operation: 'GraphQL Mutation.createLabel', userId: 'user-id', errorName: 'Error' },
      );
    });

  });
});
