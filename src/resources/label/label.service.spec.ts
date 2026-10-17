import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { LabelService } from './label.service';
import { Label } from './entities/label.entity';
import { Project } from 'src/resources/project/entities/project.entity';
import { User } from 'src/resources/user/entities/user.entity';
import { ProjectRole } from 'src/resources/project/enums/project-role';
import { GlobalRole } from 'src/resources/user/enums/global-role';

import { ProjectService } from 'src/resources/project/project.service';
import { UserService } from 'src/resources/user/user.service';
import { LoggerService } from 'src/logger/logger.service';
import { CreateLabelDto } from './dto/create-label.dto';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LABEL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

function buildLabel(project: Project): Label {
  return {
    id: LABEL_ID,
    name: 'frontend',
    color: '#3b82f6',
    project,
    issues: [],
    createdAt: new Date(),
  };
}

function userWithRole(userId: string, globalRole: GlobalRole = GlobalRole.REGULAR_USER): User {
  return { id: userId, globalRole } as User;
}

describe('LabelService', () => {
  let labelService: LabelService;
  let mockLabelRepository: any;
  let mockProjectService: any;
  let mockUserService: any;
  let mockLoggerService: any;

  beforeEach(async () => {
    mockLabelRepository = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
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
        LabelService,
        { provide: getRepositoryToken(Label), useValue: mockLabelRepository },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: UserService, useValue: mockUserService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    labelService = module.get<LabelService>(LabelService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(labelService).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateLabelDto = { projectId: PROJECT_ID, name: 'frontend', color: '#3b82f6' };

    it('should create a label for a project editor', async () => {
      mockLabelRepository.findOne.mockResolvedValue(buildLabel(buildProject()));
      const result = await labelService.create(dto, EDITOR_ID);
      expect(result).toBeDefined();
      expect(mockLoggerService.info).toHaveBeenCalled();
    });

    it('should throw Forbidden for a viewer', async () => {
      await expect(labelService.create(dto, VIEWER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw Forbidden for a non-member', async () => {
      await expect(labelService.create(dto, OUTSIDER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAllByProjectId', () => {
    it('should return labels for a project member', async () => {
      mockLabelRepository.find.mockResolvedValue([buildLabel(buildProject())]);
      const result = await labelService.findAllByProjectId(PROJECT_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
    });

    it('should throw Forbidden for a non-member', async () => {
      await expect(labelService.findAllByProjectId(PROJECT_ID, OUTSIDER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOneById', () => {
    it('should throw BadRequest for an invalid uuid', async () => {
      await expect(labelService.findOneById(INVALID_UUID, OWNER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFound if the label does not exist', async () => {
      mockLabelRepository.findOne.mockResolvedValue(null);
      await expect(labelService.findOneById(LABEL_ID, OWNER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw Forbidden for a non-member', async () => {
      mockLabelRepository.findOne.mockResolvedValue(buildLabel(buildProject()));
      await expect(labelService.findOneById(LABEL_ID, OUTSIDER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update the label for an editor', async () => {
      mockLabelRepository.findOne.mockResolvedValue(buildLabel(buildProject()));
      const result = await labelService.update(LABEL_ID, { name: 'backend' }, EDITOR_ID);
      expect(result).toBeDefined();
    });

    it('should throw Forbidden for a viewer', async () => {
      mockLabelRepository.findOne.mockResolvedValue(buildLabel(buildProject()));
      await expect(labelService.update(LABEL_ID, { name: 'backend' }, VIEWER_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete the label for the project owner', async () => {
      mockLabelRepository.findOne.mockResolvedValue(buildLabel(buildProject()));
      const result = await labelService.remove(LABEL_ID, OWNER_ID);
      expect(result).toBe(true);
    });

    it('should throw Forbidden for an editor', async () => {
      mockLabelRepository.findOne.mockResolvedValue(buildLabel(buildProject()));
      await expect(labelService.remove(LABEL_ID, EDITOR_ID)).rejects.toThrow(ForbiddenException);
    });
  });

});
