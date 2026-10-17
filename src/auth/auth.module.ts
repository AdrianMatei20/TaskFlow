import { Module } from '@nestjs/common';
import { UserModule } from 'src/resources/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResetPassword } from './reset-password/reset-password.entity';
import { Log } from 'src/logger/entities/log.entity';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthController } from './auth.controller';

import { AuthService } from './auth.service';
import { LocalStrategy } from './strategies/local.strategy';
import { SessionSerializer } from './serialization.provider';
import { EmailService } from 'src/services/email/email.service';
import { TokenService } from 'src/services/token/token.service';
import { JwtService } from '@nestjs/jwt';
import { ResetPasswordService } from './reset-password/reset-password.service';
import { ResetPasswordCleanupService } from './reset-password-cleanup/reset-password-cleanup.service';
import { LoggerService } from 'src/logger/logger.service';

@Module({
  imports: [UserModule, TypeOrmModule.forFeature([ResetPassword, Log]), ScheduleModule.forRoot()],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, SessionSerializer, EmailService, TokenService, JwtService, ResetPasswordService, ResetPasswordCleanupService, LoggerService],
})
export class AuthModule {}
