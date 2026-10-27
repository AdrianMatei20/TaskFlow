import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { validate as isValidUUID } from 'uuid';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AssignUserDto } from './dto/assign-user.dto';

import { Project } from './entities/project.entity';
import { UserProjectRole } from './entities/user-project-role.entity';
import { User } from '../user/entities/user.entity';
import { ProjectRole } from './enums/project-role';

import { UserService } from '../user/user.service';
import { LoggerService } from 'src/logger/logger.service';
import { CacheService } from 'src/cache/cache.service';

import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { LOG_MESSAGES } from 'src/constants/log-messages';
import { RETURN_MESSAGES } from 'src/constants/return-messages';

@Injectable()
export class ProjectService {

  constructor(
    @InjectRepository(Project) private projectRepository: Repository<Project>,
    @InjectRepository(UserProjectRole) private userProjectRoleRepository: Repository<UserProjectRole>,
    private readonly userService: UserService,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
  ) { }

  async create(createProjectDto: CreateProjectDto, userId: string): Promise<Project> {
    // Check if the id is a valid UUID
    if (!isValidUUID(userId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.CREATE.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.create,
        { userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
      });
    }

    // Check if user exists
    const user: User = await this.userService.findOneById(userId);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.CREATE.USER_NOT_FOUND(createProjectDto.name, userId),
        LOG_CONTEXTS.ProjectService.create,
        { createProjectDto, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.USER,
      });
    }

    const project: Project = this.projectRepository.create({
      ...createProjectDto,
      createdAt: new Date(),
    });

    await this.projectRepository.save(project);

    const userProjectRole: AssignUserDto = {
      project: project,
      user: user,
      projectRole: ProjectRole.OWNER,
      createdAt: new Date(),
    }

    await this.userProjectRoleRepository.save(userProjectRole);

    const createdProject: Project = await this.projectRepository.findOne({
      where: { id: project.id },
      relations: ['userProjectRoles', 'userProjectRoles.user'],
    });

    await this.loggerService.info(
      LOG_MESSAGES.PROJECT.CREATE.SUCCESS(user.firstname, user.lastname, createProjectDto.name),
      LOG_CONTEXTS.ProjectService.create,
      { createProjectDto, userId },
    );

    return createdProject;
  }

  async findAll(): Promise<Project[]> {
    const projects = await this.projectRepository.find({
      relations: ['userProjectRoles', 'userProjectRoles.user']
    });
    return Array.isArray(projects) ? projects : [];
  }

  async findAllByUserId(userId: string): Promise<Project[]> {
    // Check if the id is a valid UUID
    if (!isValidUUID(userId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.FIND_ALL_BY_USER_ID.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.findAllByUserId,
        { userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
      });
    }

    // Check if user exists
    const user: User = await this.userService.findOneById(userId);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.FIND_ALL_BY_USER_ID.USER_NOT_FOUND(userId),
        LOG_CONTEXTS.ProjectService.findAllByUserId,
        { userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.USER,
      });
    }

    const userProjectRoles: UserProjectRole[] = await this.userProjectRoleRepository.find({
      relations: ['user', 'project', 'project.userProjectRoles', 'project.userProjectRoles.user']
    });

    const userProjectRolesForUser: UserProjectRole[] = userProjectRoles.filter(userProjectRole =>
      userProjectRole.user.id === userId
    );

    const userProjects: Project[] = userProjectRolesForUser.map(userProjectRole => userProjectRole.project);

    return userProjects;
  }

  async findOneById(projectId: string): Promise<Project> {
    // Check if the id is a valid UUID
    if (!isValidUUID(projectId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.findOneById,
        { projectId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_PROJECT_ID,
      });
    }

    // Try to retrieve the project from cache
    const cacheKey = `project:${projectId}`;
    try {
      // Try fetching from cache
      const cachedProject = await this.cacheService.get<Project>(cacheKey);
      if (cachedProject) {
        return cachedProject;
      }
    } catch (error) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.FAILED_TO_RETRIEVE_PROJECT_FROM_CACHE(projectId),
        LOG_CONTEXTS.ProjectService.findOneById,
        error.message,
      );
      // Continue to DB even if cache read fails
    }

    // Check if project exists
    const project: Project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['userProjectRoles', 'userProjectRoles.user'],
    });
    if (!project) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.PROJECT_NOT_FOUND(projectId),
        LOG_CONTEXTS.ProjectService.findOneById,
        { projectId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.PROJECT,
      });
    }

    // Cache the project for 5 minutes (300 seconds)
    try {
      await this.cacheService.set(cacheKey, project, 5 * 60);
    } catch (error) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.FIND_ONE_BY_ID.FAILED_TO_CACHE_PROJECT(projectId),
        LOG_CONTEXTS.ProjectService.findOneById,
        error.message,
      );
    }

    return project;
  }

  async update(projectId: string, updateProjectDto: UpdateProjectDto): Promise<Project> {
    // Check if the id is a valid UUID
    if (!isValidUUID(projectId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.UPDATE.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.update,
        { projectId, updateProjectDto },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_PROJECT_ID,
      });
    }

    // Check if project exists
    const project: Project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: { userProjectRoles: true },
    });
    if (!project) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.UPDATE.PROJECT_NOT_FOUND(projectId),
        LOG_CONTEXTS.ProjectService.update,
        { projectId, updateProjectDto },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.PROJECT,
      });
    }

    // Check that at least one field was provided (per-field rules are enforced by the global ValidationPipe)
    const missingProperties: string[] = ['name', 'description'].filter((key) => updateProjectDto[key] === undefined);
    if (missingProperties.length === 2) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.UPDATE.MISSING_PROPS(project.name, missingProperties),
        LOG_CONTEXTS.ProjectService.update,
        { projectId, updateProjectDto },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.MISSING_PROPS(missingProperties),
      });
    }

    await this.projectRepository.update(projectId, updateProjectDto);

    var updatedProject: Project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['userProjectRoles', 'userProjectRoles.user'],
    });

    await this.loggerService.info(
      LOG_MESSAGES.PROJECT.UPDATE.SUCCESS(project.name),
      LOG_CONTEXTS.ProjectService.update,
      { projectId, project, updateProjectDto },
    );

    return updatedProject;
  }

  async remove(projectId: string): Promise<Boolean> {
    // Check if the id is a valid UUID
    if (!isValidUUID(projectId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.REMOVE.INVALID_UUID,
        LOG_CONTEXTS.ProjectService.remove,
        { projectId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_PROJECT_ID,
      });
    }

    // Check if project exists
    const project: Project = await this.projectRepository.findOne({ where: { id: projectId } });
    if (!project) {
      await this.loggerService.warn(
        LOG_MESSAGES.PROJECT.REMOVE.PROJECT_NOT_FOUND(projectId),
        LOG_CONTEXTS.ProjectService.remove,
        { projectId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.PROJECT,
      });
    }

    await this.projectRepository.delete(projectId);
    await this.loggerService.info(
      LOG_MESSAGES.PROJECT.REMOVE.SUCCESS(project.name),
      LOG_CONTEXTS.ProjectService.remove,
      { projectId, project },
    );
    return true;
  }
}
