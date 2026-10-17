import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { LoggerModule } from 'src/logger/logger.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from 'src/cache/cache.module';
import { Project } from './entities/project.entity';
import { UserProjectRole } from './entities/user-project-role.entity';
import { Log } from 'src/logger/entities/log.entity';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { LoggerService } from 'src/logger/logger.service';
import { registerEnumType } from '@nestjs/graphql';
import { ProjectRole } from './enums/project-role';

@Module({
  imports: [UserModule, LoggerModule, TypeOrmModule.forFeature([Project, UserProjectRole, Log]), CacheModule],
  controllers: [ProjectController],
  providers: [ProjectService, LoggerService],
  exports: [ProjectService],
})
export class ProjectModule {

  constructor() {
    registerEnumType(ProjectRole, {
      name: 'ProjectRole',
      description: 'Roles within a project',
    });
  }

}
