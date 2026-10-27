import { BadRequestException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { validate as isValidUUID } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

import { Comment } from './entities/comment.entity';
import { Issue } from 'src/resources/issue/entities/issue.entity';
import { User } from 'src/resources/user/entities/user.entity';
import { ProjectRole } from 'src/resources/project/enums/project-role';
import { GlobalRole } from 'src/resources/user/enums/global-role';

import { IssueService } from 'src/resources/issue/issue.service';
import { UserService } from 'src/resources/user/user.service';
import { LoggerService } from 'src/logger/logger.service';

import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { LOG_MESSAGES } from 'src/constants/log-messages';
import { RETURN_MESSAGES } from 'src/constants/return-messages';

const COMMENT_RELATIONS = ['issue', 'issue.project', 'issue.project.userProjectRoles', 'issue.project.userProjectRoles.user', 'author'];

@Injectable()
export class CommentService {

  constructor(
    @InjectRepository(Comment) private commentRepository: Repository<Comment>,
    private readonly issueService: IssueService,
    private readonly userService: UserService,
    private readonly loggerService: LoggerService,
  ) { }

  // A comment may be edited/deleted by its own author, a project OWNER/ADMIN, or a global admin.
  private canModerate(comment: Comment, userId: string, globalRole: GlobalRole): boolean {
    if (globalRole === GlobalRole.ADMIN) return true;
    if (comment.author?.id === userId) return true;

    const membership = comment.issue.project.userProjectRoles?.find(userProjectRole => userProjectRole.user.id === userId);
    return membership ? [ProjectRole.OWNER, ProjectRole.ADMIN].includes(membership.projectRole) : false;
  }

  async create(createCommentDto: CreateCommentDto, userId: string): Promise<Comment> {
    // Reuses IssueService's own validation: invalid/missing issue id, issue not found, and
    // the "must be a project member" check already matches what commenting requires.
    const issue: Issue = await this.issueService.findOneById(createCommentDto.issueId, userId);

    const author: User = await this.userService.findOneById(userId);

    const comment: Comment = this.commentRepository.create({
      body: createCommentDto.body,
      issue,
      author,
      createdAt: new Date(),
    });

    await this.commentRepository.save(comment);

    const createdComment: Comment = await this.commentRepository.findOne({ where: { id: comment.id }, relations: COMMENT_RELATIONS });

    await this.loggerService.info(
      LOG_MESSAGES.COMMENT.CREATE.SUCCESS(issue.id),
      LOG_CONTEXTS.CommentService.create,
      { createCommentDto, userId },
    );

    return createdComment;
  }

  async findAllByIssueId(issueId: string, userId: string): Promise<Comment[]> {
    // Reuses IssueService's own validation/membership check.
    await this.issueService.findOneById(issueId, userId);

    return await this.commentRepository.find({
      where: { issue: { id: issueId } },
      relations: COMMENT_RELATIONS,
      order: { createdAt: 'ASC' },
    });
  }

  async update(commentId: string, updateCommentDto: UpdateCommentDto, userId: string): Promise<Comment> {
    if (!isValidUUID(commentId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.COMMENT.UPDATE.INVALID_UUID,
        LOG_CONTEXTS.CommentService.update,
        { commentId, updateCommentDto, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_COMMENT_ID,
      });
    }

    const comment: Comment = await this.commentRepository.findOne({ where: { id: commentId }, relations: COMMENT_RELATIONS });
    if (!comment) {
      await this.loggerService.warn(
        LOG_MESSAGES.COMMENT.UPDATE.COMMENT_NOT_FOUND(commentId),
        LOG_CONTEXTS.CommentService.update,
        { commentId, updateCommentDto, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.COMMENT,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    if (!this.canModerate(comment, userId, user?.globalRole)) {
      await this.loggerService.warn(
        LOG_MESSAGES.COMMENT.UPDATE.FORBIDDEN(userId, commentId),
        LOG_CONTEXTS.CommentService.update,
        { commentId, updateCommentDto, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.NOT_COMMENT_AUTHOR,
      });
    }

    comment.body = updateCommentDto.body;

    await this.commentRepository.save(comment);

    const updatedComment: Comment = await this.commentRepository.findOne({ where: { id: commentId }, relations: COMMENT_RELATIONS });

    await this.loggerService.info(
      LOG_MESSAGES.COMMENT.UPDATE.SUCCESS(commentId),
      LOG_CONTEXTS.CommentService.update,
      { commentId, updateCommentDto, userId },
    );

    return updatedComment;
  }

  async remove(commentId: string, userId: string): Promise<boolean> {
    if (!isValidUUID(commentId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.COMMENT.REMOVE.INVALID_UUID,
        LOG_CONTEXTS.CommentService.remove,
        { commentId, userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_COMMENT_ID,
      });
    }

    const comment: Comment = await this.commentRepository.findOne({ where: { id: commentId }, relations: COMMENT_RELATIONS });
    if (!comment) {
      await this.loggerService.warn(
        LOG_MESSAGES.COMMENT.REMOVE.COMMENT_NOT_FOUND(commentId),
        LOG_CONTEXTS.CommentService.remove,
        { commentId, userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.COMMENT,
      });
    }

    const user: User = await this.userService.findOneById(userId);
    if (!this.canModerate(comment, userId, user?.globalRole)) {
      await this.loggerService.warn(
        LOG_MESSAGES.COMMENT.REMOVE.FORBIDDEN(userId, commentId),
        LOG_CONTEXTS.CommentService.remove,
        { commentId, userId },
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: RETURN_MESSAGES.FORBIDDEN.NOT_COMMENT_AUTHOR,
      });
    }

    await this.commentRepository.delete(commentId);
    await this.loggerService.info(
      LOG_MESSAGES.COMMENT.REMOVE.SUCCESS(commentId),
      LOG_CONTEXTS.CommentService.remove,
      { commentId, userId },
    );
    return true;
  }

}
