import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { CommentService } from './comment.service';
import { Comment } from './entities/comment.entity';
import { Issue } from 'src/resources/issue/entities/issue.entity';
import { Project } from 'src/resources/project/entities/project.entity';
import { User } from 'src/resources/user/entities/user.entity';
import { ProjectRole } from 'src/resources/project/enums/project-role';
import { GlobalRole } from 'src/resources/user/enums/global-role';
import { IssueType } from 'src/resources/issue/enums/issue-type';
import { IssueStatus } from 'src/resources/issue/enums/issue-status';
import { IssuePriority } from 'src/resources/issue/enums/issue-priority';

import { IssueService } from 'src/resources/issue/issue.service';
import { UserService } from 'src/resources/user/user.service';
import { LoggerService } from 'src/logger/logger.service';
import { CreateCommentDto } from './dto/create-comment.dto';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ISSUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMMENT_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EDITOR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VIEWER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OUTSIDER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const INVALID_UUID = 'not-a-uuid';

function buildProject(): Project {
  return {
    id: PROJECT_ID,
    name: 'Test Project',
    description: 'A project for tests.',
    createdAt: new Date(),
    issues: [],
    userProjectRoles: [
      { id: 'upr-1', user: { id: OWNER_ID } as User, project: null, projectRole: ProjectRole.OWNER, createdAt: new Date() },
      { id: 'upr-2', user: { id: EDITOR_ID } as User, project: null, projectRole: ProjectRole.EDITOR, createdAt: new Date() },
      { id: 'upr-3', user: { id: VIEWER_ID } as User, project: null, projectRole: ProjectRole.VIEWER, createdAt: new Date() },
    ],
  };
}

function buildIssue(): Issue {
  return {
    id: ISSUE_ID,
    title: 'Bug found',
    description: 'Something is broken.',
    type: IssueType.BUG,
    status: IssueStatus.TODO,
    priority: IssuePriority.MEDIUM,
    project: buildProject(),
    reporter: { id: OWNER_ID } as User,
    assignee: null,
    labels: [],
    comments: [],
    dueDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildComment(authorId: string = VIEWER_ID): Comment {
  return {
    id: COMMENT_ID,
    body: 'This is a comment.',
    issue: buildIssue(),
    author: { id: authorId } as User,
    createdAt: new Date(),
  };
}

function userWithRole(userId: string, globalRole: GlobalRole = GlobalRole.REGULAR_USER): User {
  return { id: userId, globalRole } as User;
}

describe('CommentService', () => {
  let commentService: CommentService;
  let mockCommentRepository: any;
  let mockIssueService: any;
  let mockUserService: any;
  let mockLoggerService: any;

  beforeEach(async () => {
    mockCommentRepository = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    };

    mockIssueService = {
      findOneById: jest.fn().mockResolvedValue(buildIssue()),
    };

    mockUserService = {
      findOneById: jest.fn().mockImplementation((id: string) => Promise.resolve(userWithRole(id))),
    };

    mockLoggerService = {
      error: jest.fn().mockResolvedValue({}),
      warn: jest.fn().mockResolvedValue({}),
      info: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: getRepositoryToken(Comment), useValue: mockCommentRepository },
        { provide: IssueService, useValue: mockIssueService },
        { provide: UserService, useValue: mockUserService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    commentService = module.get<CommentService>(CommentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(commentService).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateCommentDto = { issueId: ISSUE_ID, body: 'Looks good to me.' };

    it('should create a comment for a project viewer (any member may comment)', async () => {
      mockCommentRepository.findOne.mockResolvedValue(buildComment());
      const result = await commentService.create(dto, VIEWER_ID);
      expect(result).toBeDefined();
      expect(mockLoggerService.info).toHaveBeenCalled();
    });

    it('should propagate Forbidden from IssueService for a non-member', async () => {
      mockIssueService.findOneById.mockRejectedValue(new ForbiddenException());
      await expect(commentService.create(dto, OUTSIDER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAllByIssueId', () => {
    it('should return comments for a project member', async () => {
      mockCommentRepository.find.mockResolvedValue([buildComment()]);
      const result = await commentService.findAllByIssueId(ISSUE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
    });

    it('should propagate NotFound from IssueService if the issue does not exist', async () => {
      mockIssueService.findOneById.mockRejectedValue(new NotFoundException());
      await expect(commentService.findAllByIssueId(ISSUE_ID, VIEWER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should let the author edit their own comment', async () => {
      mockCommentRepository.findOne.mockResolvedValue(buildComment(VIEWER_ID));
      const result = await commentService.update(COMMENT_ID, { body: 'Edited.' }, VIEWER_ID);
      expect(result).toBeDefined();
    });

    it('should let a project owner edit someone else\'s comment', async () => {
      mockCommentRepository.findOne.mockResolvedValue(buildComment(VIEWER_ID));
      const result = await commentService.update(COMMENT_ID, { body: 'Edited by owner.' }, OWNER_ID);
      expect(result).toBeDefined();
    });

    it('should throw Forbidden for another member who is not the author or an owner/admin', async () => {
      mockCommentRepository.findOne.mockResolvedValue(buildComment(VIEWER_ID));
      await expect(commentService.update(COMMENT_ID, { body: 'Edited.' }, EDITOR_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFound if the comment does not exist', async () => {
      mockCommentRepository.findOne.mockResolvedValue(null);
      await expect(commentService.update(COMMENT_ID, { body: 'Edited.' }, VIEWER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequest for an invalid uuid', async () => {
      await expect(commentService.update(INVALID_UUID, { body: 'Edited.' }, VIEWER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should let the author delete their own comment', async () => {
      mockCommentRepository.findOne.mockResolvedValue(buildComment(VIEWER_ID));
      const result = await commentService.remove(COMMENT_ID, VIEWER_ID);
      expect(result).toBe(true);
    });

    it('should throw Forbidden for another member who is not the author or an owner/admin', async () => {
      mockCommentRepository.findOne.mockResolvedValue(buildComment(VIEWER_ID));
      await expect(commentService.remove(COMMENT_ID, EDITOR_ID)).rejects.toThrow(ForbiddenException);
    });
  });

});
