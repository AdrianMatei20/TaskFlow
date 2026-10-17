import { ArgumentMetadata, BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';

import { createValidationPipe } from './validation-pipe.provider';
import { LoggerService } from 'src/logger/logger.service';

import { CreateIssueDto } from 'src/resources/issue/dto/create-issue.dto';
import { UpdateIssueDto } from 'src/resources/issue/dto/update-issue.dto';
import { CreateLabelDto } from 'src/resources/label/dto/create-label.dto';
import { UpdateProjectDto } from 'src/resources/project/dto/update-project.dto';
import { RegisterUserDto } from 'src/resources/user/dto/register-user.dto';
import { IssuePriority } from 'src/resources/issue/enums/issue-priority';

import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { LOG_MESSAGES } from 'src/constants/log-messages';

describe('ValidationPipe (global)', () => {
  let pipe: ValidationPipe;

  const mockLoggerService = {
    warn: jest.fn(),
  };

  const projectId = '08c71152-c552-42e7-b094-f510ff44e9cb';

  const body = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({ type: 'body', metatype });

  const getValidationError = async (value: unknown, metatype: ArgumentMetadata['metatype']): Promise<BadRequestException> => {
    try {
      await pipe.transform(value, body(metatype));
    } catch (error) {
      return error;
    }
    throw new Error('Expected the pipe to reject the value');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pipe = createValidationPipe(mockLoggerService as unknown as LoggerService);
  });

  it('should pass a valid body through as a DTO instance', async () => {
    const result = await pipe.transform({ projectId, title: 'Title', description: 'Description' }, body(CreateIssueDto));

    expect(result).toBeInstanceOf(CreateIssueDto);
    expect(result).toEqual({ projectId, title: 'Title', description: 'Description' });
    expect(mockLoggerService.warn).not.toHaveBeenCalled();
  });

  it('should strip properties that are not declared on the DTO', async () => {
    const result = await pipe.transform({ projectId, title: 'Title', description: 'Description', reporterId: 'hacker' }, body(CreateIssueDto));

    expect(result).not.toHaveProperty('reporterId');
  });

  it('should convert an ISO date string into a Date', async () => {
    const result: CreateIssueDto = await pipe.transform(
      { projectId, title: 'Title', description: 'Description', dueDate: '2026-12-01T00:00:00.000Z' },
      body(CreateIssueDto),
    );

    expect(result.dueDate).toEqual(new Date('2026-12-01T00:00:00.000Z'));
  });

  it('should return 400 BadRequest listing every failed rule', async () => {
    const error = await getValidationError({ projectId: 'not-a-uuid', title: '', priority: 'URGENT' }, CreateIssueDto);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: expect.arrayContaining([
        'projectId must be a UUID',
        'title should not be empty',
        'description must be a string',
        `priority must be one of the following values: ${Object.values(IssuePriority).join(', ')}`,
      ]),
    });
  });

  it('should return one message per invalid property, starting with the basic type check', async () => {
    const error = await getValidationError({}, RegisterUserDto);

    expect(error.getResponse()).toMatchObject({
      message: [
        'firstname must be a string',
        'lastname must be a string',
        'email must be an email',
        'password must be a string',
        'passwordConfirmation must be a string',
      ],
    });
  });

  it('should report invalid array items by index', async () => {
    const error = await getValidationError({ projectId, title: 'Title', description: '', labelIds: ['not-a-uuid'] }, CreateIssueDto);

    expect(error.getResponse()).toMatchObject({ message: ['each value in labelIds must be a UUID'] });
  });

  it('should reject an explicit null for a non-nullable optional field', async () => {
    const error = await getValidationError({ title: null }, UpdateIssueDto);

    expect(error.getResponse()).toMatchObject({ message: expect.arrayContaining(['title must be a string']) });
  });

  it('should accept an explicit null for a nullable field', async () => {
    const result = await pipe.transform({ assigneeId: null, dueDate: null }, body(UpdateIssueDto));

    expect(result).toEqual({ assigneeId: null, dueDate: null });
  });

  it('should reject colors that are not in the #rrggbb format', async () => {
    const error = await getValidationError({ projectId, name: 'frontend', color: '#fff' }, CreateLabelDto);

    expect(error.getResponse()).toMatchObject({ message: ['color must be a hex color in the format #rrggbb'] });
  });

  it('should inherit CreateProjectDto rules in UpdateProjectDto while making fields optional', async () => {
    await expect(pipe.transform({}, body(UpdateProjectDto))).resolves.toEqual({});

    const error = await getValidationError({ name: 'x'.repeat(26) }, UpdateProjectDto);
    expect(error.getResponse()).toMatchObject({ message: ['name must be shorter than or equal to 25 characters'] });
  });

  it('should log the failure without logging submitted values', async () => {
    await getValidationError({ firstname: 'Adrian', lastname: 'Matei', email: 'not-an-email', password: 'short', passwordConfirmation: 'short' }, RegisterUserDto);

    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      LOG_MESSAGES.VALIDATION.FAILED('RegisterUserDto', ['email', 'password']),
      LOG_CONTEXTS.ValidationPipe,
      {
        dto: 'RegisterUserDto',
        failures: [
          { property: 'email', constraints: ['isEmail'] },
          { property: 'password', constraints: ['minLength'] },
        ],
      },
    );
    expect(JSON.stringify(mockLoggerService.warn.mock.calls)).not.toContain('short');
  });

  it('should leave primitive params untouched', async () => {
    await expect(pipe.transform(projectId, { type: 'query', metatype: String, data: 'projectId' })).resolves.toBe(projectId);
  });

});
