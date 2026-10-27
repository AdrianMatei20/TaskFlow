import { BadRequestException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { validate as isValidUUID } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

import { Issue } from './entities/issue.entity';
import { Label } from 'src/resources/label/entities/label.entity';
import { Project } from 'src/resources/project/entities/project.entity';
import { User } from 'src/resources/user/entities/user.entity';
import { ProjectRole } from 'src/resources/project/enums/project-role';
import { GlobalRole } from 'src/resources/user/enums/global-role';

import { ProjectService } from 'src/resources/project/project.service';
import { UserService } from 'src/resources/user/user.service';
import { LoggerService } from 'src/logger/logger.service';

import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { LOG_MESSAGES } from 'src/constants/log-messages';
import { RETURN_MESSAGES } from 'src/constants/return-messages';

const ISSUE_RELATIONS = ['project', 'project.userProjectRoles', 'project.userProjectRoles.user', 'reporter', 'assignee', 'labels'];

@Injectable()
export class IssueService {

  constructor(
    @InjectRepository(Issue) private issueRepository: Repository<Issue>,
    @InjectRepository(Label) private labelRepository: Repository<Label>,
    private readonly projectService: ProjectService,
    private readonly userService: UserService,
    private readonly loggerService: LoggerService,
  ) { }

  // Returns the requesting user's standing with respect to a project: whether they're a
  // global admin (who can act on any project regardless of membership) and, if not, their
  // project-specific role (or null if they aren't a member at all).
  private resolveAccess(project: Project, userId: string, globalRole: GlobalRole): { isGlobalAdmin: boolean; projectRole: ProjectRole | null } {
    const isGlobalAdmin = globalRole === GlobalRole.ADMIN;
    const membership = project.userProjectRoles?.find(userProjectRole => userProjectRole.user.id === userId);
    return { isGlobalAdmin, projectRole: membership ? membership.projectRole : null };
  }

  private isMember(access: { isGlobalAdmin: boolean; projectRole: ProjectRole | null }): boolean {
    return access.isGlobalAdmin || access.projectRole !== null;
  }

  private canWrite(access: { isGlobalAdmin: boolean; projectRole: ProjectRole | null }): boolean {
    return access.isGlobalAdmin || [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.EDITOR].includes(access.projectRole);
  }

  private canDelete(access: { isGlobalAdmin: boolean; projectRole: ProjectRole | null }): boolean {
    return access.isGlobalAdmin || [ProjectRole.OWNER, ProjectRole.ADMIN].includes(access.projectRole);
  }

  async create(createIssueDto: CreateIssueDto, userId: string): Promise<Issue> {
    // Check if the project exists (also validates the project id is a UUID).
    const project: Project = await this.projectService.findOneById(createIssueDto.projectId);

    const reporter: User = await this.userService.findOneById(userId);

    // Check if the user has permission to create issues on this project
    const access = this.resolveAccess(project, userId, reporter?.globalRole);
    if (!this.canWrite(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.CREATE.FORBIDDEN(userId, project.id),
        LOG_CONTEXTS.IssueService.create,
        { createIssueDto, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE,
      });
    }

    // Resolve the assignee, if one was provided (must be a member of the project)
    let assignee: User | null = null;
    if (createIssueDto.assigneeId) {
      if (!isValidUUID(createIssueDto.assigneeId)) {
        await this.loggerService.warn(
          LOG_MESSAGES.ISSUE.CREATE.INVALID_ASSIGNEE_ID,
          LOG_CONTEXTS.IssueService.create,
          { createIssueDto, userId },
        );
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.BAD_REQUEST.INVALID_ASSIGNEE_ID,
        });
      }

      const isAssigneeMember = project.userProjectRoles?.some(userProjectRole => userProjectRole.user.id === createIssueDto.assigneeId);
      if (!isAssigneeMember) {
        await this.loggerService.warn(
          LOG_MESSAGES.ISSUE.CREATE.ASSIGNEE_NOT_FOUND(createIssueDto.assigneeId),
          LOG_CONTEXTS.IssueService.create,
          { createIssueDto, userId },
        );
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: RETURN_MESSAGES.NOT_FOUND.ASSIGNEE,
        });
      }

      assignee = await this.userService.findOneById(createIssueDto.assigneeId);
    }

    // Resolve labels, if provided (must belong to the same project)
    const labels: Label[] = createIssueDto.labelIds?.length
      ? await this.labelRepository.find({ where: { id: In(createIssueDto.labelIds), project: { id: project.id } } })
      : [];

    const now = new Date();
    const issue: Issue = this.issueRepository.create({
      title: createIssueDto.title,
      description: createIssueDto.description,
      type: createIssueDto.type,
      priority: createIssueDto.priority,
      project,
      reporter,
      assignee,
      labels,
      dueDate: createIssueDto.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await this.issueRepository.save(issue);

    const createdIssue: Issue = await this.issueRepository.findOne({
      where: { id: issue.id },
      relations: ISSUE_RELATIONS,
    });

    await this.loggerService.info(
      LOG_MESSAGES.ISSUE.CREATE.SUCCESS(createdIssue.title, project.name),
      LOG_CONTEXTS.IssueService.create,
      { createIssueDto, userId },
    );

    return createdIssue;
  }

  async findAllByProjectId(projectId: string, userId: string): Promise<Issue[]> {
    // Check if the project exists (also validates the project id is a UUID).
    const project: Project = await this.projectService.findOneById(projectId);

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(project, userId, user?.globalRole);
    if (!this.isMember(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.FIND_ALL.FORBIDDEN(userId, projectId),
        LOG_CONTEXTS.IssueService.findAllByProjectId,
        { projectId, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.NOT_A_PROJECT_MEMBER,
      });
    }

    return await this.issueRepository.find({
      where: { project: { id: projectId } },
      relations: ISSUE_RELATIONS,
      order: { createdAt: 'DESC' },
    });
  }

  // Used by the GraphQL DataLoader behind Project.issues: the latest `first` issues of each project, for many projects in
  // one query. A plain LIMIT would cap the whole result, so ROW_NUMBER() numbers the issues within each project and keeps
  // the first `first` of each. No access check here: the parent project query has already checked that the user can see
  // the project. No relations either: assignee/reporter are resolved by their own field resolvers.
  async findPagesByProjectIds(projectIds: readonly string[], first: number): Promise<Issue[]> {
    return await this.issueRepository.createQueryBuilder('issue')
      .where(`issue.id IN (
        SELECT ranked.id FROM (
          SELECT i.id, ROW_NUMBER() OVER (PARTITION BY i."projectId" ORDER BY i."createdAt" DESC) AS position
          FROM issue i
          WHERE i."projectId" IN (:...projectIds)
        ) ranked
        WHERE ranked.position <= :first
      )`, { projectIds, first })
      .orderBy('issue.createdAt', 'DESC')
      .getMany();
  }

  async findOneById(issueId: string, userId: string): Promise<Issue> {
    if (!isValidUUID(issueId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.FIND_ONE_BY_ID.INVALID_UUID,
        LOG_CONTEXTS.IssueService.findOneById,
        { issueId, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_ISSUE_ID,
      });
    }

    const issue: Issue = await this.issueRepository.findOne({ where: { id: issueId }, relations: ISSUE_RELATIONS });

    if (!issue) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.FIND_ONE_BY_ID.ISSUE_NOT_FOUND(issueId),
        LOG_CONTEXTS.IssueService.findOneById,
        { issueId, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.ISSUE,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(issue.project, userId, user?.globalRole);
    if (!this.isMember(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.FIND_ONE_BY_ID.FORBIDDEN(userId, issueId),
        LOG_CONTEXTS.IssueService.findOneById,
        { issueId, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.NOT_A_PROJECT_MEMBER,
      });
    }

    return issue;
  }

  async update(issueId: string, updateIssueDto: UpdateIssueDto, userId: string): Promise<Issue> {
    if (!isValidUUID(issueId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.UPDATE.INVALID_UUID,
        LOG_CONTEXTS.IssueService.update,
        { issueId, updateIssueDto, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_ISSUE_ID,
      });
    }

    const issue: Issue = await this.issueRepository.findOne({ where: { id: issueId }, relations: ISSUE_RELATIONS });
    if (!issue) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.UPDATE.ISSUE_NOT_FOUND(issueId),
        LOG_CONTEXTS.IssueService.update,
        { issueId, updateIssueDto, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.ISSUE,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(issue.project, userId, user?.globalRole);
    if (!this.canWrite(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.UPDATE.FORBIDDEN(userId, issueId),
        LOG_CONTEXTS.IssueService.update,
        { issueId, updateIssueDto, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE,
      });
    }

    if (updateIssueDto.title !== undefined) issue.title = updateIssueDto.title;
    if (updateIssueDto.description !== undefined) issue.description = updateIssueDto.description;
    if (updateIssueDto.type !== undefined) issue.type = updateIssueDto.type;
    if (updateIssueDto.status !== undefined) issue.status = updateIssueDto.status;
    if (updateIssueDto.priority !== undefined) issue.priority = updateIssueDto.priority;
    if (updateIssueDto.dueDate !== undefined) issue.dueDate = updateIssueDto.dueDate;

    if (updateIssueDto.assigneeId !== undefined) {
      if (updateIssueDto.assigneeId === null) {
        issue.assignee = null;
      } else {
        if (!isValidUUID(updateIssueDto.assigneeId)) {
          await this.loggerService.warn(
            LOG_MESSAGES.ISSUE.UPDATE.INVALID_ASSIGNEE_ID,
            LOG_CONTEXTS.IssueService.update,
            { issueId, updateIssueDto, userId },
          );
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: RETURN_MESSAGES.BAD_REQUEST.INVALID_ASSIGNEE_ID,
          });
        }

        const isAssigneeMember = issue.project.userProjectRoles?.some(userProjectRole => userProjectRole.user.id === updateIssueDto.assigneeId);
        if (!isAssigneeMember) {
          await this.loggerService.warn(
            LOG_MESSAGES.ISSUE.UPDATE.ASSIGNEE_NOT_FOUND(updateIssueDto.assigneeId),
            LOG_CONTEXTS.IssueService.update,
            { issueId, updateIssueDto, userId },
          );
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: RETURN_MESSAGES.NOT_FOUND.ASSIGNEE,
          });
        }

        issue.assignee = await this.userService.findOneById(updateIssueDto.assigneeId);
      }
    }

    if (updateIssueDto.labelIds !== undefined) {
      issue.labels = updateIssueDto.labelIds.length
        ? await this.labelRepository.find({ where: { id: In(updateIssueDto.labelIds), project: { id: issue.project.id } } })
        : [];
    }

    issue.updatedAt = new Date();

    await this.issueRepository.save(issue);

    const updatedIssue: Issue = await this.issueRepository.findOne({ where: { id: issueId }, relations: ISSUE_RELATIONS });

    await this.loggerService.info(
      LOG_MESSAGES.ISSUE.UPDATE.SUCCESS(updatedIssue.title),
      LOG_CONTEXTS.IssueService.update,
      { issueId, updateIssueDto, userId },
    );

    return updatedIssue;
  }

  async remove(issueId: string, userId: string): Promise<boolean> {
    if (!isValidUUID(issueId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.REMOVE.INVALID_UUID,
        LOG_CONTEXTS.IssueService.remove,
        { issueId, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_ISSUE_ID,
      });
    }

    const issue: Issue = await this.issueRepository.findOne({ where: { id: issueId }, relations: ISSUE_RELATIONS });
    if (!issue) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.REMOVE.ISSUE_NOT_FOUND(issueId),
        LOG_CONTEXTS.IssueService.remove,
        { issueId, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.ISSUE,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(issue.project, userId, user?.globalRole);
    if (!this.canDelete(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.ISSUE.REMOVE.FORBIDDEN(userId, issueId),
        LOG_CONTEXTS.IssueService.remove,
        { issueId, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE,
      });
    }

    await this.issueRepository.delete(issueId);
    await this.loggerService.info(
      LOG_MESSAGES.ISSUE.REMOVE.SUCCESS(issue.title),
      LOG_CONTEXTS.IssueService.remove,
      { issueId, userId },
    );
    return true;
  }

}
