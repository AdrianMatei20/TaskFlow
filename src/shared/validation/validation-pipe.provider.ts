import { BadRequestException, HttpStatus, Provider, ValidationError, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { LoggerService } from 'src/logger/logger.service';

import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { LOG_MESSAGES } from 'src/constants/log-messages';

interface ValidationFailure {
  property: string;
  constraints: string[];
  messages: string[];
}

// Flattens nested ValidationErrors into dotted property paths (e.g. "labelIds.0").
export function flattenValidationErrors(errors: ValidationError[], parentPath: string = ''): ValidationFailure[] {
  return errors.flatMap((error) => {
    const property = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: ValidationFailure[] = error.constraints
      ? [{ property, constraints: Object.keys(error.constraints), messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], property)];
  });
}

export function createValidationPipe(loggerService: LoggerService): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    // One message per invalid property. class-validator runs a property's decorators bottom-up, so DTOs put
    // the basic type check (@IsString, @IsUUID...) closest to the property and stricter rules above it.
    stopAtFirstError: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const failures = flattenValidationErrors(errors);
      const dto: string = errors[0]?.target?.constructor?.name ?? 'unknown';

      // Only property paths and rule names are logged, never the submitted values (e.g. passwords).
      void loggerService.warn(
        LOG_MESSAGES.VALIDATION.FAILED(dto, failures.map((failure) => failure.property)),
        LOG_CONTEXTS.ValidationPipe,
        { dto, failures: failures.map(({ property, constraints }) => ({ property, constraints })) },
      );

      return new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: failures.flatMap((failure) => failure.messages),
        error: 'Bad Request',
      });
    },
  });
}

// Registered as APP_PIPE (rather than app.useGlobalPipes in main.ts) so it can inject LoggerService
// and also applies to e2e tests and GraphQL resolvers, which build the app from AppModule.
export const validationPipeProvider: Provider = {
  provide: APP_PIPE,
  inject: [LoggerService],
  useFactory: createValidationPipe,
};
