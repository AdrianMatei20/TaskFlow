import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserService } from 'src/resources/user/user.service';
import { EmailService } from 'src/services/email/email.service';
import { TokenService } from 'src/services/token/token.service';
import { ResetPasswordService } from './reset-password/reset-password.service';
import { JwtService } from '@nestjs/jwt';
import { LoggerService } from 'src/logger/logger.service';
import { forgotPasswordDto, getResetPasswordDto, user, userJamesSmith } from 'test/data/users';
import { SimpleMessageDto } from 'src/shared/utils/simple-message.dto';
import { loginUserDto, registerUserDto } from 'test/data/register-user';
import { HttpStatus } from '@nestjs/common';
import { regularUserRequest } from 'test/data/requests';
import { RETURN_MESSAGES } from 'src/constants/return-messages';

describe('AuthController', () => {
  let authController: AuthController;
  let mockAuthService: any;
  let mockUserService: UserService;
  let mockEmailService: EmailService;
  let mockResetPasswordService: ResetPasswordService;
  let mockLoggerService: LoggerService;

  beforeEach(async () => {
    mockAuthService = {
      registerUser: jest.fn().mockResolvedValue({}),
      verifyUser: jest.fn().mockResolvedValue({}),
      findByEmail: jest.fn().mockResolvedValue({}),
      sendResetPasswordEmail: jest.fn().mockResolvedValue({}),
      sendForgotPasswordEmail: jest.fn().mockResolvedValue({}),
      resetPassword: jest.fn().mockResolvedValue({}),
      deleteUser: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        TokenService,
        JwtService,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: ResetPasswordService,
          useValue: mockResetPasswordService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(authController).toBeDefined();
  });

  describe('POST /register', () => {

    it('should call AuthService.registerUser with the correct parameters', async () => {
      const expectedResult: SimpleMessageDto = {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.REGISTRATION_EMAIL_SENT,
      };

      (mockAuthService.registerUser as jest.Mock).mockResolvedValue(expectedResult);

      const actualResult: SimpleMessageDto = await authController.registerUser(registerUserDto);

      expect(actualResult).toEqual(expectedResult);
      expect(mockAuthService.registerUser).toHaveBeenCalledWith(registerUserDto);
    });

  });

  describe('GET /verify-user/:id/:token', () => {

    it('should call AuthService.verifyUser with the correct parameters', async () => {
      const expectedResult: SimpleMessageDto = {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.SUCCESSFUL_VERIFICATION,
      };

      (mockAuthService.verifyUser as jest.Mock).mockResolvedValue(expectedResult);

      const actualResult: SimpleMessageDto = await authController.verifyUser(userJamesSmith.id, 'token');

      expect(actualResult).toEqual(expectedResult);
      expect(mockAuthService.verifyUser).toHaveBeenCalledWith(userJamesSmith.id, 'token');
    });

  });

  describe('POST /login', () => {

    it('should call AuthService.findByEmail with the correct parameters and return a login message', async () => {
      const expectedResult: SimpleMessageDto = {
        statusCode: HttpStatus.CREATED,
        message: RETURN_MESSAGES.CREATED.SUCCESSFUL_REGISTRATION(user.firstname, user.lastname),
      };

      (mockAuthService.findByEmail as jest.Mock).mockResolvedValue(user);

      const actualResult: SimpleMessageDto = await authController.loginUser(loginUserDto);

      expect(actualResult).toEqual(expectedResult);
      expect(mockAuthService.findByEmail).toHaveBeenCalledWith(loginUserDto.email);
    });

  });

  describe('GET /reset-password', () => {

    it('should call AuthService.sendResetPasswordEmail with the correct parameters', async () => {
      const expectedResult: SimpleMessageDto = {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.RESET_PASSWORD_EMAIL_SENT,
      };

      (mockAuthService.sendResetPasswordEmail as jest.Mock).mockResolvedValue(expectedResult);

      const actualResult: SimpleMessageDto = await authController.sendResetPasswordEmail(regularUserRequest);

      expect(actualResult).toEqual(expectedResult);
      expect(mockAuthService.sendResetPasswordEmail).toHaveBeenCalledWith(userJamesSmith.id);
    });

  });

  describe('GET /forgot-password', () => {

    it('should call AuthService.sendForgotPasswordEmail with the correct parameters', async () => {
      const expectedResult: SimpleMessageDto = {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.FORGOT_PASSWORD_EMAIL_SENT,
      };

      (mockAuthService.sendForgotPasswordEmail as jest.Mock).mockResolvedValue(expectedResult);

      const actualResult: SimpleMessageDto = await authController.sendForgotPasswordEmail(forgotPasswordDto);

      expect(actualResult).toEqual(expectedResult);
      expect(mockAuthService.sendForgotPasswordEmail).toHaveBeenCalledWith(forgotPasswordDto);
    });

  });

  describe('GET /reset-password/:id/:token', () => {

    it('should call AuthService.resetPassword with the correct parameters', async () => {
      const expectedResult: SimpleMessageDto = {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.PASSWORD_RESET,
      };

      (mockAuthService.resetPassword as jest.Mock).mockResolvedValue(expectedResult);

      const actualResult: SimpleMessageDto = await authController.resetPassword(userJamesSmith.id, 'token', getResetPasswordDto());

      expect(actualResult).toEqual(expectedResult);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(userJamesSmith.id, 'token', getResetPasswordDto());
    });

  });

  describe('DELETE', () => {

    it('should call destroy session and delete user', async () => {
      const mockReq = {
        session: {
          destroy: jest.fn(),
        },
        user: { id: 'some-user-id' },
      };

      const mockRes = {
        clearCookie: jest.fn(),
      };

      const expectedResult: SimpleMessageDto = {
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.ACCOUNT_DELETED,
      };

      (mockAuthService.deleteUser as jest.Mock).mockResolvedValue(expectedResult);

      const actualResult = await authController.deleteUser(mockReq as any, mockRes as any);

      expect(mockReq.session.destroy).toHaveBeenCalled();
      expect(mockRes.clearCookie).toHaveBeenCalledWith('SESSION_ID');
      expect(mockAuthService.deleteUser).toHaveBeenCalledWith('some-user-id');
      expect(actualResult).toEqual(expectedResult);
    });

  });

  describe('GET /logout', () => {

    it('should destroy session and clear cookie on logout', async () => {
      const mockReq = {
        session: {
          destroy: jest.fn(),
        },
      };
    
      const mockRes = {
        clearCookie: jest.fn(),
      };
    
      const result = await authController.logoutUser(mockReq as any, mockRes as any);
    
      expect(mockReq.session.destroy).toHaveBeenCalled();
      expect(mockRes.clearCookie).toHaveBeenCalledWith('SESSION_ID');
      expect(result).toEqual({
        statusCode: HttpStatus.OK,
        message: RETURN_MESSAGES.OK.SESSION_ENDED,
      });
    });    

  });

});
