import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { IssueModule } from '../issue/issue.module';
import { Comment } from './entities/comment.entity';
import { Log } from 'src/logger/entities/log.entity';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { LoggerService } from 'src/logger/logger.service';

@Module({
  imports: [UserModule, IssueModule, TypeOrmModule.forFeature([Comment, Log])],
  controllers: [CommentController],
  providers: [CommentService, LoggerService],
  exports: [CommentService],
})
export class CommentModule { }
