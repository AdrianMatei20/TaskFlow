import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { IssueService } from './issue.service';
import { Issue } from './entities/issue.entity';
import { Label } from 'src/resources/label/entities/label.entity';
import { Project } from 'src/resources/project/entities/project.entity';
import { User } from 'src/resources/user/entities/user.entity';
import { ProjectRole } from 'src/resources/project/enums/project-role';
import { GlobalRole } from 'src/resources/user/enums/global-role';
import { IssueType } from './enums/issue-type';
import { IssueStatus } from './enums/issue-status';
import { IssuePriority } from './enums/issue-priority';

import { ProjectService } from 'src/resources/project/project.service';
import { UserService } from 'src/resources/user/user.service';
import { LoggerService } from 'src/logger/logger.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ISSUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EDITOR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VIEWER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OUTSIDER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const GLOBAL_ADMIN_ID = '11111111-1111-4111-8111-111111111111';
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

function buildIssue(project: Project): Issue {
  return {
    id: ISSUE_ID,
    title: 'Bug found',
    description: 'Something is broken.',
    type: IssueType.BUG,
    status: IssueStatus.TODO,
    priority: IssuePriority.MEDIUM,
    project,
    reporter: { id: OWNER_ID } as User,
    assignee: null,
    labels: [],
    comments: [],
    dueDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function userWithRole(userId: string, globalRole: GlobalRole = GlobalRole.REGULAR_USER): User {
  return { id: userId, globalRole } as User;
}

describe('IssueService', () => {
  let issueService: IssueService;
  let mockIssueRepository: any;
  let mockLabelRepository: any;
  let mockProjectService: any;
  let mockUserService: any;
  let mockLoggerService: any;

  beforeEach(async () => {
    mockIssueRepository = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    };

    mockLabelRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockProjectService = {
      findOneById: jest.fn().mockResolvedValue(buildProject()),
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
        IssueService,
        { provide: getRepositoryToken(Issue), useValue: mockIssueRepository },
        { provide: getRepositoryToken(Label), useValue: mockLabelRepository },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: UserService, useValue: mockUserService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    issueService = module.get<IssueService>(IssueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(issueService).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateIssueDto = {
      projectId: PROJECT_ID,
      title: 'New issue',
      description: 'Description',
    };

    it('should create an issue for a project editor', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));

      const result = await issueService.create(dto, EDITOR_ID);

      expect(mockIssueRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(mockLoggerService.info).toHaveBeenCalled();
    });

    it('should create an issue for a global admin even without project membership', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));
      mockUserService.findOneById.mockResolvedValue(userWithRole(GLOBAL_ADMIN_ID, GlobalRole.ADMIN));

      const result = await issueService.create(dto, GLOBAL_ADMIN_ID);

      expect(result).toBeDefined();
    });

    it('should throw Forbidden for a viewer', async () => {
      await expect(issueService.create(dto, VIEWER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw Forbidden for a non-member', async () => {
      await expect(issueService.create(dto, OUTSIDER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequest for an invalid assignee id', async () => {
      await expect(issueService.create({ ...dto, assigneeId: INVALID_UUID }, EDITOR_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequest for an assignee who is not a project member', async () => {
      await expect(issueService.create({ ...dto, assigneeId: OUTSIDER_ID }, EDITOR_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('should assign the issue when the assignee is a project member', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));

      await issueService.create({ ...dto, assigneeId: VIEWER_ID }, EDITOR_ID);

      expect(mockUserService.findOneById).toHaveBeenCalledWith(VIEWER_ID);
    });
  });

  describe('findAllByProjectId', () => {
    it('should return issues for a project member', async () => {
      mockIssueRepository.find.mockResolvedValue([buildIssue(buildProject())]);

      const result = await issueService.findAllByProjectId(PROJECT_ID, VIEWER_ID);

      expect(result).toHaveLength(1);
    });

    it('should throw Forbidden for a non-member', async () => {
      await expect(issueService.findAllByProjectId(PROJECT_ID, OUTSIDER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOneById', () => {
    it('should throw BadRequest for an invalid uuid', async () => {
      await expect(issueService.findOneById(INVALID_UUID, OWNER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFound if the issue does not exist', async () => {
      mockIssueRepository.findOne.mockResolvedValue(null);
      await expect(issueService.findOneById(ISSUE_ID, OWNER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw Forbidden for a non-member', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));
      await expect(issueService.findOneById(ISSUE_ID, OUTSIDER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should return the issue for a project member', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));
      const result = await issueService.findOneById(ISSUE_ID, VIEWER_ID);
      expect(result.id).toBe(ISSUE_ID);
    });
  });

  describe('update', () => {
    const dto: UpdateIssueDto = { status: IssueStatus.IN_PROGRESS };

    it('should update the issue for an editor', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));
      const result = await issueService.update(ISSUE_ID, dto, EDITOR_ID);
      expect(result).toBeDefined();
      expect(mockLoggerService.info).toHaveBeenCalled();
    });

    it('should throw Forbidden for a viewer', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));
      await expect(issueService.update(ISSUE_ID, dto, VIEWER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFound if the issue does not exist', async () => {
      mockIssueRepository.findOne.mockResolvedValue(null);
      await expect(issueService.update(ISSUE_ID, dto, EDITOR_ID)).rejects.toThrow(NotFoundException);
    });

    it('should unassign the issue when assigneeId is null', async () => {
      const issue = buildIssue(buildProject());
      issue.assignee = { id: EDITOR_ID } as User;
      mockIssueRepository.findOne.mockResolvedValue(issue);

      const result = await issueService.update(ISSUE_ID, { assigneeId: null }, EDITOR_ID);
      expect(result.assignee).toBeNull();
    });
  });

  describe('remove', () => {
    it('should delete the issue for the project owner', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));
      const result = await issueService.remove(ISSUE_ID, OWNER_ID);
      expect(result).toBe(true);
      expect(mockIssueRepository.delete).toHaveBeenCalledWith(ISSUE_ID);
    });

    it('should throw Forbidden for an editor', async () => {
      mockIssueRepository.findOne.mockResolvedValue(buildIssue(buildProject()));
      await expect(issueService.remove(ISSUE_ID, EDITOR_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequest for an invalid uuid', async () => {
      await expect(issueService.remove(INVALID_UUID, OWNER_ID)).rejects.toThrow(BadRequestException);
    });
  });

});
