import { BadRequestException, ForbiddenException, HttpStatus, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { validate as isValidUUID } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

import { Label } from './entities/label.entity';
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

const LABEL_RELATIONS = ['project', 'project.userProjectRoles', 'project.userProjectRoles.user'];

@Injectable()
export class LabelService {

  constructor(
    @InjectRepository(Label) private labelRepository: Repository<Label>,
    private readonly projectService: ProjectService,
    private readonly userService: UserService,
    private readonly loggerService: LoggerService,
  ) { }

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

  async create(createLabelDto: CreateLabelDto, userId: string): Promise<Label> {
    const project: Project = await this.projectService.findOneById(createLabelDto.projectId);

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(project, userId, user?.globalRole);
    if (!this.canWrite(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.CREATE.FORBIDDEN(userId, project.id),
        LOG_CONTEXTS.LabelService.create,
        { createLabelDto, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE,
      });
    }

    try {
      const label: Label = this.labelRepository.create({
        name: createLabelDto.name,
        color: createLabelDto.color,
        project,
        createdAt: new Date(),
      });

      await this.labelRepository.save(label);

      const createdLabel: Label = await this.labelRepository.findOne({ where: { id: label.id }, relations: LABEL_RELATIONS });

      await this.loggerService.info(
        LOG_MESSAGES.LABEL.CREATE.SUCCESS(createdLabel.name, project.name),
        LOG_CONTEXTS.LabelService.create,
        { createLabelDto, userId },
      );

      return createdLabel;
    } catch (error) {
      await this.loggerService.error(
        LOG_MESSAGES.LABEL.CREATE.FAILED_TO_CREATE_LABEL(createLabelDto.name),
        LOG_CONTEXTS.LabelService.create,
        error.message,
        { createLabelDto, userId },
      );
      throw new InternalServerErrorException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: RETURN_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }

  async findAllByProjectId(projectId: string, userId: string): Promise<Label[]> {
    const project: Project = await this.projectService.findOneById(projectId);

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(project, userId, user?.globalRole);
    if (!this.isMember(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.FIND_ALL.FORBIDDEN(userId, projectId),
        LOG_CONTEXTS.LabelService.findAllByProjectId,
        { projectId, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.NOT_A_PROJECT_MEMBER,
      });
    }

    try {
      return await this.labelRepository.find({
        where: { project: { id: projectId } },
        relations: LABEL_RELATIONS,
        order: { name: 'ASC' },
      });
    } catch (error) {
      await this.loggerService.error(
        LOG_MESSAGES.LABEL.FIND_ALL.FAILED_TO_RETRIEVE_LABELS(projectId),
        LOG_CONTEXTS.LabelService.findAllByProjectId,
        error.message,
        { projectId, userId },
      );
      throw new InternalServerErrorException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: RETURN_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }

  async findOneById(labelId: string, userId: string): Promise<Label> {
    if (!isValidUUID(labelId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.FIND_ONE_BY_ID.INVALID_UUID,
        LOG_CONTEXTS.LabelService.findOneById,
        { labelId, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_LABEL_ID,
      });
    }

    const label: Label = await this.labelRepository.findOne({ where: { id: labelId }, relations: LABEL_RELATIONS });
    if (!label) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.FIND_ONE_BY_ID.LABEL_NOT_FOUND(labelId),
        LOG_CONTEXTS.LabelService.findOneById,
        { labelId, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.LABEL,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(label.project, userId, user?.globalRole);
    if (!this.isMember(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.FIND_ONE_BY_ID.FORBIDDEN(userId, labelId),
        LOG_CONTEXTS.LabelService.findOneById,
        { labelId, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.NOT_A_PROJECT_MEMBER,
      });
    }

    return label;
  }

  async update(labelId: string, updateLabelDto: UpdateLabelDto, userId: string): Promise<Label> {
    if (!isValidUUID(labelId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.UPDATE.INVALID_UUID,
        LOG_CONTEXTS.LabelService.update,
        { labelId, updateLabelDto, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_LABEL_ID,
      });
    }

    const label: Label = await this.labelRepository.findOne({ where: { id: labelId }, relations: LABEL_RELATIONS });
    if (!label) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.UPDATE.LABEL_NOT_FOUND(labelId),
        LOG_CONTEXTS.LabelService.update,
        { labelId, updateLabelDto, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.LABEL,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(label.project, userId, user?.globalRole);
    if (!this.canWrite(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.UPDATE.FORBIDDEN(userId, labelId),
        LOG_CONTEXTS.LabelService.update,
        { labelId, updateLabelDto, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE,
      });
    }

    if (updateLabelDto.name !== undefined) label.name = updateLabelDto.name;
    if (updateLabelDto.color !== undefined) label.color = updateLabelDto.color;

    try {
      await this.labelRepository.save(label);

      const updatedLabel: Label = await this.labelRepository.findOne({ where: { id: labelId }, relations: LABEL_RELATIONS });

      await this.loggerService.info(
        LOG_MESSAGES.LABEL.UPDATE.SUCCESS(updatedLabel.name),
        LOG_CONTEXTS.LabelService.update,
        { labelId, updateLabelDto, userId },
      );

      return updatedLabel;
    } catch (error) {
      await this.loggerService.error(
        LOG_MESSAGES.LABEL.UPDATE.FAILED_TO_UPDATE_LABEL(labelId),
        LOG_CONTEXTS.LabelService.update,
        error.message,
        { labelId, updateLabelDto, userId },
      );
      throw new InternalServerErrorException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: RETURN_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }

  async remove(labelId: string, userId: string): Promise<boolean> {
    if (!isValidUUID(labelId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.REMOVE.INVALID_UUID,
        LOG_CONTEXTS.LabelService.remove,
        { labelId, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_LABEL_ID,
      });
    }

    const label: Label = await this.labelRepository.findOne({ where: { id: labelId }, relations: LABEL_RELATIONS });
    if (!label) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.REMOVE.LABEL_NOT_FOUND(labelId),
        LOG_CONTEXTS.LabelService.remove,
        { labelId, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.LABEL,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    const access = this.resolveAccess(label.project, userId, user?.globalRole);
    if (!this.canDelete(access)) {
      await this.loggerService.warn(
        LOG_MESSAGES.LABEL.REMOVE.FORBIDDEN(userId, labelId),
        LOG_CONTEXTS.LabelService.remove,
        { labelId, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE,
      });
    }

    try {
      await this.labelRepository.delete(labelId);
      await this.loggerService.info(
        LOG_MESSAGES.LABEL.REMOVE.SUCCESS(label.name),
        LOG_CONTEXTS.LabelService.remove,
        { labelId, userId },
      );
      return true;
    } catch (error) {
      await this.loggerService.error(
        LOG_MESSAGES.LABEL.REMOVE.FAILED_TO_DELETE_LABEL(labelId),
        LOG_CONTEXTS.LabelService.remove,
        error.message,
        { labelId, userId },
      );
      throw new InternalServerErrorException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: RETURN_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }

}
