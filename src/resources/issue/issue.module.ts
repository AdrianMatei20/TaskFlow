import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { registerEnumType } from '@nestjs/graphql';
import { UserModule } from '../user/user.module';
import { ProjectModule } from '../project/project.module';
import { Issue } from './entities/issue.entity';
import { Label } from '../label/entities/label.entity';
import { Log } from 'src/logger/entities/log.entity';
import { IssueController } from './issue.controller';
import { IssueService } from './issue.service';
import { LoggerService } from 'src/logger/logger.service';
import { IssueType } from './enums/issue-type';
import { IssueStatus } from './enums/issue-status';
import { IssuePriority } from './enums/issue-priority';

@Module({
  imports: [UserModule, ProjectModule, TypeOrmModule.forFeature([Issue, Label, Log])],
  controllers: [IssueController],
  providers: [IssueService, LoggerService],
  exports: [IssueService],
})
export class IssueModule {

  constructor() {
    registerEnumType(IssueType, { name: 'IssueType', description: 'An issue\'s type.' });
    registerEnumType(IssueStatus, { name: 'IssueStatus', description: 'An issue\'s workflow status.' });
    registerEnumType(IssuePriority, { name: 'IssuePriority', description: 'An issue\'s priority.' });
  }

}
