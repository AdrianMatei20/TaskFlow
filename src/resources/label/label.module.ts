import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { ProjectModule } from '../project/project.module';
import { Label } from './entities/label.entity';
import { Log } from 'src/logger/entities/log.entity';
import { LabelController } from './label.controller';
import { LabelService } from './label.service';
import { LoggerService } from 'src/logger/logger.service';

@Module({
  imports: [UserModule, ProjectModule, TypeOrmModule.forFeature([Label, Log])],
  controllers: [LabelController],
  providers: [LabelService, LoggerService],
  exports: [LabelService],
})
export class LabelModule { }
