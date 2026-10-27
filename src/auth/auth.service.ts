import { BadRequestException, ConflictException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { validate as isValidUUID } from 'uuid';
import { compare, hash } from 'bcrypt';

import { UserService } from 'src/resources/user/user.service';
import { EmailService } from 'src/services/email/email.service';
import { TokenService } from 'src/services/token/token.service';
import { ResetPasswordService } from './reset-password/reset-password.service';
import { LoggerService } from 'src/logger/logger.service';

import { SimpleMessageDto } from 'src/shared/utils/simple-message.dto';
import { LogInUserDto } from './dto/log-in-user.dto';
import { RegisterUserDto } from 'src/resources/user/dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

import { User } from 'src/resources/user/entities/user.entity';
import { ResetPassword } from './reset-password/reset-password.entity';

import { LOG_MESSAGES } from 'src/constants/log-messages';
import { LOG_CONTEXTS } from 'src/constants/log-contexts';
import { RETURN_MESSAGES } from 'src/constants/return-messages';
import { AdminUserDto } from 'src/resources/user/dto/admin-user.dto';

@Injectable()
export class AuthService {

  constructor(
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly resetPasswordService: ResetPasswordService,
    private readonly loggerService: LoggerService,
  ) { }

  // A failed email is a known failure mode (503), unlike other errors, which the global exception filter turns into a 500.
  // EmailService reports failure by resolving to false; a rejected promise is treated the same way.
  private async sendEmailOrFail(email: Promise<boolean>, logMessage: (reason: string) => string, context: string, metadata: object): Promise<void> {
    const reason: string | null = await email.then(
      (sent) => (sent ? null : 'the email provider did not accept the message'),
      (error) => error.message,
    );
    if (reason === null) {
      return;
    }

    await this.loggerService.error(logMessage(reason), context, reason, metadata);
    throw new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: RETURN_MESSAGES.SERVICE_UNAVAILABLE,
    });
  }

  async validateUser(user: LogInUserDto) {
    var foundUser: User = null;
    try {
      foundUser = await this.userService.findOneByEmail(user.email);
    } catch (error) {
      return null;
    }

    if (!foundUser) {
      return null;
    }

    const matched = await compare(user.password, foundUser.password);

    if (!matched) {
      return null;
    }

    return foundUser;
  }

  async registerUser(registerUserDto: RegisterUserDto, sendConfirmationEmail: boolean = true): Promise<SimpleMessageDto> {
    const { password, passwordConfirmation, ...rest } = registerUserDto;
    const sanitizedRegisterUserDto = {
      ...rest,
      password: password ? '[REDACTED]' : undefined,
      passwordConfirmation: passwordConfirmation ? '[REDACTED]' : undefined,
    };

    // Check if user email already exists
    if (await this.userService.findOneByEmail(registerUserDto.email)) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.REGISTER_USER.EMAIL_ALREADY_REGISTERED,
        LOG_CONTEXTS.AuthService.registerUser,
        { registerUserDto: sanitizedRegisterUserDto },
      );
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        message: RETURN_MESSAGES.CONFLICT.EMAIL_ALREADY_REGISTERED,
      });
    }

    // Check if passwords match
    if (registerUserDto.password !== registerUserDto.passwordConfirmation) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.REGISTER_USER.PASSWORD_MISMATCH,
        LOG_CONTEXTS.AuthService.registerUser,
        { registerUserDto: sanitizedRegisterUserDto },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.PASSWORD_MISMATCH,
      });
    }

    // Create new user (unexpected errors are logged and turned into a 500 by the global exception filter)
    registerUserDto.password = await hash(registerUserDto.password, 12);
    const user: User = await this.userService.create(registerUserDto);
    await this.loggerService.info(
      LOG_MESSAGES.AUTH.REGISTER_USER.SUCCESS(user.firstname, user.lastname, user.email),
      LOG_CONTEXTS.AuthService.registerUser,
      { registerUserDto: sanitizedRegisterUserDto, user: new AdminUserDto(user) },
    );

    if (sendConfirmationEmail) {
      const payload = { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname };
      const token: string = this.tokenService.createToken(payload);
      const link: string = 'http://localhost:3001/auth/verify-user/' + user.id + "/" + token;
      await this.sendEmailOrFail(
        this.emailService.sendRegistrationEmail(user.email, user.firstname + " " + user.lastname, link),
        (reason) => LOG_MESSAGES.AUTH.REGISTER_USER.FAILED_TO_SEND_EMAIL(user.email, reason),
        LOG_CONTEXTS.AuthService.registerUser,
        { registerUserDto: sanitizedRegisterUserDto },
      );
      await this.loggerService.info(
        LOG_MESSAGES.AUTH.REGISTER_USER.CONFIRMATION_EMAIL(user.email),
        LOG_CONTEXTS.AuthService.registerUser,
        { registerUserDto: sanitizedRegisterUserDto, user: new AdminUserDto(user) },
      );
    }

    return {
      statusCode: HttpStatus.OK,
      message: RETURN_MESSAGES.OK.REGISTRATION_EMAIL_SENT,
    };
  }

  async verifyUser(userId: string, token: string): Promise<SimpleMessageDto> {
    // Check if the id is a valid UUID
    if (!isValidUUID(userId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.VERIFY_USER.INVALID_UUID,
        LOG_CONTEXTS.AuthService.verifyUser,
        { userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
      });
    }

    // Check if the user exists
    const user: User = await this.userService.findOneById(userId);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.VERIFY_USER.USER_NOT_FOUND(userId),
        LOG_CONTEXTS.AuthService.verifyUser,
        { userId },
      );
      return {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.SUCCESSFUL_VERIFICATION,
      };
    }

    // Check if the token is valid
    try {
      this.tokenService.verifyToken(token);
    } catch (error) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.VERIFY_USER.BAD_TOKEN(token),
        LOG_CONTEXTS.AuthService.verifyUser,
        { userId, token },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.BAD_TOKEN,
      });
    }

    // Mark the account as verified
    const isUpdated: User = await this.userService.markUserAccountAsVerified(user);

    if (isUpdated) {
      this.loggerService.info(
        LOG_MESSAGES.AUTH.VERIFY_USER.SUCCESS(user.firstname, user.lastname, user.email),
        LOG_CONTEXTS.AuthService.verifyUser,
        { userId, token },
      );
      return {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.SUCCESSFUL_VERIFICATION,
      };
    }
  }

  async sendResetPasswordEmail(userId: string): Promise<SimpleMessageDto> {
    // Check if the id is a valid UUID
    if (!isValidUUID(userId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.SEND_RESET_PASSWORD_EMAIL.INVALID_UUID,
        LOG_CONTEXTS.AuthService.sendResetPasswordEmail,
        { userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
      });
    }

    // Check if the user exists
    const user: User = await this.userService.findOneById(userId);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.SEND_RESET_PASSWORD_EMAIL.USER_NOT_FOUND(userId),
        LOG_CONTEXTS.AuthService.sendResetPasswordEmail,
        { userId },
      );
      return {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.RESET_PASSWORD_EMAIL_SENT,
      }
    }

    const token: string = await this.resetPasswordService.createResetToken(user.id);
    const link: string = "http://localhost:3001/auth/reset-password/" + user.id + "/" + token;
    await this.sendEmailOrFail(
      this.emailService.sendResetPasswordEmail(user.email, user.firstname + " " + user.lastname, link),
      (reason) => LOG_MESSAGES.AUTH.SEND_RESET_PASSWORD_EMAIL.FAILED_TO_SEND_RESET_PASSWORD_EMAIL(user.email, reason),
      LOG_CONTEXTS.AuthService.sendResetPasswordEmail,
      { user },
    );
    await this.loggerService.info(
      LOG_MESSAGES.AUTH.SEND_RESET_PASSWORD_EMAIL.SUCCESS(user.email),
      LOG_CONTEXTS.AuthService.sendResetPasswordEmail,
      { user },
    );
    return {
      statusCode: HttpStatus.OK,
      message: RETURN_MESSAGES.OK.RESET_PASSWORD_EMAIL_SENT,
    };
  }

  async sendForgotPasswordEmail(forgotPasswordDto: ForgotPasswordDto): Promise<SimpleMessageDto> {
    // Check if the user exists
    const user: User = await this.userService.findOneByEmail(forgotPasswordDto.email);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.SEND_FORGOT_PASSWORD_EMAIL.USER_NOT_FOUND(forgotPasswordDto.email),
        LOG_CONTEXTS.AuthService.sendForgotPasswordEmail,
        { forgotPasswordDto },
      );
      return {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.FORGOT_PASSWORD_EMAIL_SENT,
      }
    }

    const token: string = await this.resetPasswordService.createResetToken(user.id);
    const link: string = "http://localhost:3001/auth/reset-password/" + user.id + "/" + token;
    await this.sendEmailOrFail(
      this.emailService.sendResetPasswordEmail(user.email, user.firstname + " " + user.lastname, link),
      (reason) => LOG_MESSAGES.AUTH.SEND_FORGOT_PASSWORD_EMAIL.FAILED_TO_SEND_RESET_PASSWORD_EMAIL(forgotPasswordDto.email, reason),
      LOG_CONTEXTS.AuthService.sendForgotPasswordEmail,
      { forgotPasswordDto, user },
    );
    await this.loggerService.info(
      LOG_MESSAGES.AUTH.SEND_FORGOT_PASSWORD_EMAIL.SUCCESS(user.email),
      LOG_CONTEXTS.AuthService.sendForgotPasswordEmail,
      { forgotPasswordDto, user },
    );
    return {
      statusCode: HttpStatus.OK,
      message: RETURN_MESSAGES.OK.FORGOT_PASSWORD_EMAIL_SENT,
    };
  }

  async resetPassword(userId: string, token: string, resetPasswordDto: ResetPasswordDto): Promise<SimpleMessageDto> {
    // Check if the id is a valid UUID
    if (!isValidUUID(userId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.RESET_PASSWORD.INVALID_UUID,
        LOG_CONTEXTS.AuthService.resetPassword,
        { userId, token, resetPasswordDto },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
      });
    }

    // Check if the user exists
    const user: User = await this.userService.findOneById(userId);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.RESET_PASSWORD.USER_NOT_FOUND(userId),
        LOG_CONTEXTS.AuthService.resetPassword,
        { userId, token, resetPasswordDto },
      );
      return {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.PASSWORD_RESET,
      }
    }

    const isValid: boolean = await this.resetPasswordService.validateResetToken(token);

    if (!isValid) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.RESET_PASSWORD.BAD_TOKEN,
        LOG_CONTEXTS.AuthService.resetPassword,
        { userId, token, resetPasswordDto },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.BAD_TOKEN,
      });
    }

    if (resetPasswordDto.password !== resetPasswordDto.passwordConfirmation) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.RESET_PASSWORD.PASSWORD_MISMATCH,
        LOG_CONTEXTS.AuthService.resetPassword,
        { userId, token, resetPasswordDto },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.PASSWORD_MISMATCH,
      });
    }

    const newPassword: string = await hash(resetPasswordDto.password, 12);
    user.password = newPassword;

    const resetPassword: ResetPassword = await this.resetPasswordService.findByToken(token);

    if (await this.userService.update(resetPassword.user.id, user)) {
      await this.resetPasswordService.invalidateResetToken(token);
      await this.loggerService.info(
        LOG_MESSAGES.AUTH.RESET_PASSWORD.SUCCESS,
        LOG_CONTEXTS.AuthService.resetPassword,
        { userId, token, resetPasswordDto },
      );
      return {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.PASSWORD_RESET,
      };
    }
  }

  async findById(userId: string): Promise<User> {
    return await this.userService.findOneById(userId);
  }

  async findByEmail(email: string): Promise<User> {
    // Check if the user exists
    const user: User = await this.userService.findOneByEmail(email);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.FIND_BY_EMAIL.USER_NOT_FOUND(email),
        LOG_CONTEXTS.AuthService.findByEmail,
        { email },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.USER,
      });
    }

    return user;
  }

  async deleteUser(userId: string): Promise<SimpleMessageDto> {
    // Check if the id is a valid UUID
    if (!isValidUUID(userId)) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.DELETE_USER.INVALID_UUID,
        LOG_CONTEXTS.AuthService.deleteUser,
        { userId },
      );
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: RETURN_MESSAGES.BAD_REQUEST.INVALID_USER_ID,
      });
    }

    // Check if the user exists
    const user: User = await this.userService.findOneById(userId);
    if (!user) {
      await this.loggerService.warn(
        LOG_MESSAGES.AUTH.DELETE_USER.USER_NOT_FOUND(userId),
        LOG_CONTEXTS.AuthService.deleteUser,
        { userId },
      );
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: RETURN_MESSAGES.NOT_FOUND.USER,
      });
    }

    await this.userService.remove(userId);
    await this.loggerService.info(
      LOG_MESSAGES.AUTH.DELETE_USER.SUCCESS(user.email),
      LOG_CONTEXTS.AuthService.deleteUser,
      { userId, user },
    );
    return {
      statusCode: HttpStatus.OK,
      message: RETURN_MESSAGES.OK.ACCOUNT_DELETED,
    };
  }

}
