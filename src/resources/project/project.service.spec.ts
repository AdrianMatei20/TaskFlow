import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { UserService } from '../user/user.service';
import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Project } from './entities/project.entity';
import { UserProjectRole } from './entities/user-project-role.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { LoggerService } from 'src/logger/logger.service';
import { createProjectDto, JamesOwnerAndChristopherMember, project, projectFour, projects, projectOne, projectThree, projectTwo, projectWithJamesOwnerAndChristopherMember, RonaldOwnerAndJamesMember, updateProjectDto, updateProjectDtoEmpty, userProjectRole, userProjectRoles } from 'test/data/projects';
import { userJamesSmith } from 'test/data/users';
import { invalidUUID, nonExistingUserId } from 'test/data/UUIDs';
import { LOG_MESSAGES } from 'src/constants/log-messages';
import { CACHE_ERROR, DATABASE_ERROR } from 'src/constants/test-messages';
import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { RETURN_MESSAGES } from 'src/constants/return-messages';
import { CacheService } from 'src/cache/cache.service';

describe('ProjectService', () => {
  let projectService: ProjectService;
  let mockUserService: any;
  let mockProjectRepository: any;
  let mockUserProjectRoleRepository: any;
  let mockLoggerService: any;
  let mockCacheService: any;

  beforeEach(async () => {
    mockProjectRepository = {
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({}),
    };

    mockUserProjectRoleRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue([]),
    };

    mockUserService = {
      findOneById: jest.fn().mockResolvedValue({}),
    };

    mockLoggerService = {
      error: jest.fn().mockResolvedValue({}),
      warn: jest.fn().mockResolvedValue({}),
      info: jest.fn().mockResolvedValue({}),
    };

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        {
          provide: getRepositoryToken(UserProjectRole),
          useValue: mockUserProjectRoleRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    projectService = module.get<ProjectService>(ProjectService);
  });

  afterEach(() => {
    jest.clearAllMocks(); // Clears mock calls, instances, and results
    jest.resetModules(); // Clears module imports (if needed)
  });

  it('should be defined', () => {
    expect(projectService).toBeDefined();
  });

  describe('create', () => {

    it('should return 400 BadRequest for invalid user id', async () => {
      await expect(projectService.create(createProjectDto as CreateProjectDto, invalidUUID))
        .rejects.toThrow(BadRequestException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.CREATE.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.create,
        { userId: invalidUUID },
      );

      try {
        await projectService.create(createProjectDto as CreateProjectDto, invalidUUID);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
        });
      }
    });

    it('should let errors from userService.findOneById propagate to the global exception filter', async () => {
      (mockUserService.findOneById as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.create(createProjectDto, userJamesSmith.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return 404 NotFound for non-existing user', async () => {
      (mockUserService.findOneById as jest.Mock).mockResolvedValue(null);

      await expect(projectService.create(createProjectDto, nonExistingUserId))
        .rejects.toThrow(NotFoundException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.CREATE.USER_NOT_FOUND(createProjectDto.name, nonExistingUserId),
        LOG_CONTEXTS.ProjectService.create,
        { createProjectDto, userId: nonExistingUserId },
      );

      try {
        await projectService.create(createProjectDto, nonExistingUserId);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.NOT_FOUND,
          message: RETURN_MESSAGES.NOT_FOUND.USER,
        });
      }
    });

    it('should let errors from projectRepository.create propagate to the global exception filter', async () => {
      (mockUserService.findOneById as jest.Mock).mockResolvedValue(userJamesSmith);
      (mockProjectRepository.create as jest.Mock).mockImplementation(() => { throw new Error(DATABASE_ERROR); });

      await expect(projectService.create(createProjectDto, userJamesSmith.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should let errors from projectRepository.save propagate to the global exception filter', async () => {
      project.userProjectRoles = [userProjectRole];

      (mockUserService.findOneById as jest.Mock).mockResolvedValue(userJamesSmith);
      (mockProjectRepository.create as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.save as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.create(createProjectDto, userJamesSmith.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should let errors from userProjectRoleRepository.save propagate to the global exception filter', async () => {
      project.userProjectRoles = [userProjectRole];

      (mockUserService.findOneById as jest.Mock).mockResolvedValue(userJamesSmith);
      (mockProjectRepository.create as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.save as jest.Mock).mockResolvedValue(project);
      (mockUserProjectRoleRepository.save as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.create(createProjectDto, userJamesSmith.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should let errors from projectRepository.findOne propagate to the global exception filter', async () => {
      project.userProjectRoles = [userProjectRole];

      (mockUserService.findOneById as jest.Mock).mockResolvedValue(userJamesSmith);
      (mockProjectRepository.create as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.save as jest.Mock).mockResolvedValue(project);
      (mockUserProjectRoleRepository.save as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.findOne as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.create(createProjectDto, userJamesSmith.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return created project if all goes well', async () => {
      project.userProjectRoles = [userProjectRole];

      (mockUserService.findOneById as jest.Mock).mockResolvedValue(userJamesSmith);
      (mockProjectRepository.create as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.save as jest.Mock).mockResolvedValue(project);
      (mockUserProjectRoleRepository.save as jest.Mock).mockResolvedValue(userProjectRole);
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(project);

      const result = await projectService.create(createProjectDto, userJamesSmith.id);

      expect(result).toEqual(project);
      expect(mockLoggerService.info).toHaveBeenCalled();
      expect(mockLoggerService.info).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.CREATE.SUCCESS(userJamesSmith.firstname, userJamesSmith.lastname, createProjectDto.name),
        LOG_CONTEXTS.ProjectService.create,
        { createProjectDto, userId: userJamesSmith.id },
      );

    });

  });

  describe('findAll', () => {

    it('should return empty array if no projects were found', async () => {
      (mockProjectRepository.find as jest.Mock).mockResolvedValue({});

      const result = await projectService.findAll();

      expect(result).toEqual([]);
    });

    it('should return Project array if projects were found', async () => {
      (mockProjectRepository.find as jest.Mock).mockResolvedValue(projects);

      const result = await projectService.findAll();

      expect(result.length).toBe(projects.length);
      expect(result).toEqual(projects);
    });

  });

  describe('findAllByUserId', () => {

    it('should return 400 BadRequest for invalid user id', async () => {
      await expect(projectService.findAllByUserId(invalidUUID))
        .rejects.toThrow(BadRequestException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.FIND_ALL_BY_USER_ID.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.findAllByUserId,
        { userId: invalidUUID },
      );

      try {
        await projectService.findAllByUserId(invalidUUID);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
        });
      }
    });

    it('should let errors from userService.findOneById propagate to the global exception filter', async () => {
      (mockUserService.findOneById as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.findAllByUserId(userJamesSmith.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return 404 NotFound for non-existing user', async () => {
      (mockUserService.findOneById as jest.Mock).mockResolvedValue(null);

      await expect(projectService.findAllByUserId(nonExistingUserId))
        .rejects.toThrow(NotFoundException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.FIND_ALL_BY_USER_ID.USER_NOT_FOUND(nonExistingUserId),
        LOG_CONTEXTS.ProjectService.findAllByUserId,
        { userId: nonExistingUserId },
      );

      try {
        await projectService.findAllByUserId(nonExistingUserId);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.NOT_FOUND,
          message: RETURN_MESSAGES.NOT_FOUND.USER,
        });
      }
    });

    it('should let errors from userProjectRoleRepository.find propagate to the global exception filter', async () => {
      (mockUserService.findOneById as jest.Mock).mockResolvedValue(userJamesSmith);
      (mockUserProjectRoleRepository.find as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.findAllByUserId(userJamesSmith.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return empty list when user exists and has no projects', async () => {
      mockUserService.findOneById = jest.fn().mockResolvedValue(userJamesSmith);
      mockUserProjectRoleRepository.find = jest.fn().mockResolvedValue([]);

      const result = await projectService.findAllByUserId(userJamesSmith.id);

      expect(result.length).toBe(0);
    });

    it('should return projects when user exists and has projects', async () => {
      mockUserService.findOneById = jest.fn().mockResolvedValue(userJamesSmith);
      mockUserProjectRoleRepository.find = jest.fn().mockResolvedValue(userProjectRoles);

      const result = await projectService.findAllByUserId(userJamesSmith.id);

      expect(result.length).toBe(3);
    });

    it('should return one project when user exists and has one project', async () => {
      mockUserService.findOneById = jest.fn().mockResolvedValue(userJamesSmith);
      mockUserProjectRoleRepository.find = jest.fn().mockResolvedValue(RonaldOwnerAndJamesMember);

      const result = await projectService.findAllByUserId(userJamesSmith.id);

      expect(result.length).toBe(1);
    });

  });

  describe('findOneById', () => {

    it('should return 400 BadRequest for invalid project id', async () => {
      await expect(projectService.findOneById(invalidUUID))
        .rejects.toThrow(BadRequestException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.findOneById,
        { projectId: invalidUUID },
      );

      try {
        await projectService.findOneById(invalidUUID);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.BAD_REQUEST.INVALID_PROJECT_ID,
        });
      }
    });

    it('should return the project if its found cached', async () => {
      (mockCacheService.get as jest.Mock).mockReturnValue(projectWithJamesOwnerAndChristopherMember);

      const result = await projectService.findOneById(projectOne.id);

      expect(result).toEqual(projectWithJamesOwnerAndChristopherMember);
    });

    it('should let errors from both cache search and db search propagate to the global exception filter', async () => {
      (mockCacheService.get as jest.Mock).mockRejectedValue(new Error(CACHE_ERROR));
      (mockProjectRepository.findOne as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.findOneById(project.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should let errors from project is not in cache and db search propagate to the global exception filter', async () => {
      (mockCacheService.get as jest.Mock).mockReturnValue(null);
      (mockProjectRepository.findOne as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.findOneById(project.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return 404 NotFound if cache search fails and project is not found in db', async () => {
      (mockCacheService.get as jest.Mock).mockRejectedValue(new Error(CACHE_ERROR));
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(projectService.findOneById(project.id))
        .rejects.toThrow(NotFoundException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.FAILED_TO_RETRIEVE_PROJECT_FROM_CACHE(project.id),
        LOG_CONTEXTS.ProjectService.findOneById,
        CACHE_ERROR,
      );

      try {
        await projectService.findOneById(project.id);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.NOT_FOUND,
          message: RETURN_MESSAGES.NOT_FOUND.PROJECT,
        });
      }
    });

    it('should return 404 NotFound if project is not found in cache or in db', async () => {
      (mockCacheService.get as jest.Mock).mockReturnValue(null);
      (mockProjectRepository.findOne as jest.Mock).mockReturnValue(null);

      await expect(projectService.findOneById(project.id))
        .rejects.toThrow(NotFoundException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.PROJECT_NOT_FOUND(project.id),
        LOG_CONTEXTS.ProjectService.findOneById,
        { projectId: project.id },
      );

      try {
        await projectService.findOneById(project.id);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.NOT_FOUND,
          message: RETURN_MESSAGES.NOT_FOUND.PROJECT,
        });
      }
    });

    it('should return the project if cache search fails and the project is found in db', async () => {
      (mockCacheService.get as jest.Mock).mockRejectedValue(new Error(CACHE_ERROR));
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(projectWithJamesOwnerAndChristopherMember);

      const result = await projectService.findOneById(projectOne.id);

      expect(result).toEqual(projectWithJamesOwnerAndChristopherMember);

      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.FAILED_TO_RETRIEVE_PROJECT_FROM_CACHE(project.id),
        LOG_CONTEXTS.ProjectService.findOneById,
        CACHE_ERROR,
      );
    });

    it('should log a warning message if project caching fails', async () => {
      (mockCacheService.get as jest.Mock).mockRejectedValue(new Error(CACHE_ERROR));
      (mockCacheService.set as jest.Mock).mockRejectedValue(new Error(CACHE_ERROR));
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(projectWithJamesOwnerAndChristopherMember);

      const result = await projectService.findOneById(projectOne.id);

      expect(result).toEqual(projectWithJamesOwnerAndChristopherMember);

      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.FAILED_TO_CACHE_PROJECT(project.id),
        LOG_CONTEXTS.ProjectService.findOneById,
        CACHE_ERROR,
      );
    });

    it('should return the project if the project is not found in cache but is found in db', async () => {
      (mockCacheService.get as jest.Mock).mockReturnValue(null);
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(projectWithJamesOwnerAndChristopherMember);

      const result = await projectService.findOneById(projectOne.id);

      expect(result).toEqual(projectWithJamesOwnerAndChristopherMember);
    });
  });

  describe('update', () => {

    it('should return 400 BadRequest for invalid project id', async () => {
      await expect(projectService.update(invalidUUID, updateProjectDto))
        .rejects.toThrow(BadRequestException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.UPDATE.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.update,
        { projectId: invalidUUID, updateProjectDto },
      );

      try {
        await projectService.update(invalidUUID, updateProjectDto);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.BAD_REQUEST.INVALID_PROJECT_ID,
        });
      }
    });

    it('should let errors from projectRepository.findOne propagate to the global exception filter', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.update(project.id, updateProjectDto)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return 404 NotFound for non-existing project', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(projectService.update(project.id, updateProjectDto))
        .rejects.toThrow(NotFoundException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.UPDATE.PROJECT_NOT_FOUND(project.id),
        LOG_CONTEXTS.ProjectService.update,
        { projectId: project.id, updateProjectDto },
      );

      try {
        await projectService.findOneById(project.id);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.NOT_FOUND,
          message: RETURN_MESSAGES.NOT_FOUND.PROJECT,
        });
      }
    });

    it('should return 400 BadRequest for missing parameters', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(project);

      await expect(projectService.update(project.id, updateProjectDtoEmpty as UpdateProjectDto))
        .rejects.toThrow(BadRequestException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.UPDATE.MISSING_PROPS(project.name, ['name', 'description']),
        LOG_CONTEXTS.ProjectService.update,
        { projectId: project.id, updateProjectDto: updateProjectDtoEmpty },
      );

      try {
        await projectService.update(project.id, updateProjectDtoEmpty as UpdateProjectDto);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.BAD_REQUEST.MISSING_PROPS(['name', 'description']),
        });
      }
    });

    it('should let errors from projectRepository.update propagate to the global exception filter', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.update as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.update(project.id, updateProjectDto)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return updated project if only the name changes', async () => {
      const updatedProject: Project = {
        id: project.id,
        name: updateProjectDto.name,
        description: project.description,
        createdAt: project.createdAt,
        issues: project.issues,
        userProjectRoles: project.userProjectRoles,
      };

      project.userProjectRoles = JamesOwnerAndChristopherMember;
      updatedProject.userProjectRoles = JamesOwnerAndChristopherMember;

      (mockProjectRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(updatedProject);
      (mockProjectRepository.update as jest.Mock).mockResolvedValue(updatedProject);

      const result = await projectService.update(project.id, updateProjectDto as UpdateProjectDto);

      expect(result.id).toEqual(updatedProject.id);
      expect(mockLoggerService.info).toHaveBeenCalled();
      expect(mockLoggerService.info).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.UPDATE.SUCCESS(project.name),
        LOG_CONTEXTS.ProjectService.update,
        { projectId: project.id, project, updateProjectDto },
      );
    });

    it('should return updated project if only description changes', async () => {
      const updatedProject: Project = {
        id: project.id,
        name: project.name,
        description: updateProjectDto.description,
        createdAt: project.createdAt,
        issues: project.issues,
        userProjectRoles: project.userProjectRoles,
      };

      project.userProjectRoles = JamesOwnerAndChristopherMember;
      updatedProject.userProjectRoles = JamesOwnerAndChristopherMember;

      (mockProjectRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(updatedProject);
      (mockProjectRepository.update as jest.Mock).mockResolvedValue(updatedProject);

      const result = await projectService.update(project.id, updateProjectDto as UpdateProjectDto);

      expect(result).toEqual(updatedProject);
      expect(mockLoggerService.info).toHaveBeenCalled();
      expect(mockLoggerService.info).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.UPDATE.SUCCESS(project.name),
        LOG_CONTEXTS.ProjectService.update,
        { projectId: project.id, project, updateProjectDto },
      );
    });

    it('should return updated project if update succeeds', async () => {
      const updatedProject: Project = {
        id: project.id,
        name: updateProjectDto.name,
        description: updateProjectDto.description,
        createdAt: project.createdAt,
        issues: project.issues,
        userProjectRoles: project.userProjectRoles,
      };

      project.userProjectRoles = JamesOwnerAndChristopherMember;
      updatedProject.userProjectRoles = JamesOwnerAndChristopherMember;

      (mockProjectRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(project)
        .mockResolvedValueOnce(updatedProject);
      (mockProjectRepository.update as jest.Mock).mockResolvedValue(updatedProject);

      const result = await projectService.update(project.id, updateProjectDto);

      expect(result).toEqual(updatedProject);
      expect(mockLoggerService.info).toHaveBeenCalled();
      expect(mockLoggerService.info).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.UPDATE.SUCCESS(project.name),
        LOG_CONTEXTS.ProjectService.update,
        { projectId: project.id, project, updateProjectDto },
      );
    });

  });

  describe('remove', () => {

    it('should return 400 BadRequest for invalid project id', async () => {
      await expect(projectService.remove(invalidUUID))
        .rejects.toThrow(BadRequestException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.REMOVE.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.remove,
        { projectId: invalidUUID },
      );

      try {
        await projectService.remove(project.id);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.BAD_REQUEST.INVALID_PROJECT_ID,
        });
      }
    });

    it('should let errors from projectRepository.findOne propagate to the global exception filter', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.remove(project.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return 404 NotFound for non-existing project', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(projectService.remove(project.id))
        .rejects.toThrow(NotFoundException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.REMOVE.PROJECT_NOT_FOUND(project.id),
        LOG_CONTEXTS.ProjectService.remove,
        { projectId: project.id },
      );

      try {
        await projectService.remove(project.id);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(error.getResponse()).toEqual({
          statusCode: HttpStatus.NOT_FOUND,
          message: RETURN_MESSAGES.NOT_FOUND.PROJECT,
        });
      }
    });

    it('should let errors from delete propagate to the global exception filter', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.delete as jest.Mock).mockRejectedValue(new Error(DATABASE_ERROR));

      await expect(projectService.remove(project.id)).rejects.toThrow(DATABASE_ERROR);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should return true if delete succeeds', async () => {
      (mockProjectRepository.findOne as jest.Mock).mockResolvedValue(project);
      (mockProjectRepository.delete as jest.Mock).mockResolvedValue(project);

      const result = await projectService.remove(project.id);

      expect(result).toBe(true);
      expect(mockLoggerService.info).toHaveBeenCalled();
      expect(mockLoggerService.info).toHaveBeenCalledWith(
        LOG_MESSAGES.PROJECT.REMOVE.SUCCESS(project.name),
        LOG_CONTEXTS.ProjectService.remove,
        { projectId: project.id, project },
      );
    });

  });

});