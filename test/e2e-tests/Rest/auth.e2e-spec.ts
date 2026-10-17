import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { PassportModule } from "@nestjs/passport";

import { Repository } from "typeorm";
import { getRepositoryToken, TypeOrmModule } from "@nestjs/typeorm";

import { AppModule } from "../../../src/app.module";
import { AuthController } from "../../../src/auth/auth.controller";
import { AuthService } from "../../../src/auth/auth.service";

import { User } from "../../../src/resources/user/entities/user.entity";
import { UserProjectRole } from "../../../src/resources/project/entities/user-project-role.entity";
import { Project } from "../../../src/resources/project/entities/project.entity";
import { Issue } from "../../../src/resources/issue/entities/issue.entity";
import { Label } from "../../../src/resources/label/entities/label.entity";
import { Comment } from "../../../src/resources/comment/entities/comment.entity";
import { ResetPassword } from "../../../src/auth/reset-password/reset-password.entity";
import { Log } from "../../../src/logger/entities/log.entity";

import { UserService } from "../../../src/resources/user/user.service";
import { LoggerService } from "../../../src/logger/logger.service";
import { EmailService } from "../../../src/services/email/email.service";
import { ResetPasswordService } from "../../../src/auth/reset-password/reset-password.service";
import { TokenService } from "../../../src/services/token/token.service";

import { RegisterUserDto } from "src/resources/user/dto/register-user.dto";
import { emptyRegisterUserDto, getJamesSmithRegisterUserDto, registerUserDto, registerUserDtoNoEmail, registerUserDtoNoFirstname, registerUserDtoNoLastname, registerUserDtoNoPassword, registerUserDtoNoPasswordConfirmation, registerUserDtoPasswordsNotMatching } from "../../data/register-user";
import { RETURN_MESSAGES } from "../../../src/constants/return-messages";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { JwtService } from "@nestjs/jwt";
import { hash } from 'bcrypt';

describe('AuthController (e2e)', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let mockEmailService: any;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                AppModule,
                PassportModule.register({
                    session: true,
                    defaultStrategy: 'bearer'
                }),
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [User, UserProjectRole, Project, Issue, Label, Comment, ResetPassword, Log],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([User, UserProjectRole, Project, ResetPassword, Log]),
            ],
            controllers: [AuthController],
            providers: [
                AuthService,
                UserService,
                { provide: EmailService, useValue: mockEmailService },
                JwtService,
                ResetPasswordService,
                LoggerService,
                TokenService,
            ],
        }).compile();

        dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

        app = moduleFixture.createNestApplication();

        userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));

        const NUMBER_OF_HOURS: number = 3;

        app.use(
            session({
                name: 'SESSION_ID',
                secret: process.env.SECRET,
                resave: false,
                saveUninitialized: false,
                rolling: true,
                cookie: {
                    httpOnly: true,
                    maxAge: NUMBER_OF_HOURS * 60 * 60 * 1000,
                },
            })
        );

        const passport = require('passport');
        const LocalStrategy = require('passport-local').Strategy;
        app.use(passport.initialize());
        app.use(passport.session());

        await app.init();
    });

    beforeEach(async () => {
        mockEmailService = {
            sendRegistrationEmail: jest.fn().mockResolvedValue(true),
            sendResetPasswordEmail: jest.fn().mockResolvedValue(true),
        };

        const user: User = await userRepository.findOne({ where: { email: registerUserDto.email } });

        if (user) {
            await userRepository.remove(user);
        }
    });

    afterAll(async () => {
        await request(app.getHttpServer())
            .post('/auth/logout');

        await app.close();
    });

    describe('/auth/register (POST)', () => {

        it('should return BadRequest for empty body', async () => {
            return await request(app.getHttpServer())
                .post('/auth/register')
                .send(emptyRegisterUserDto)
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: [
                        'firstname must be a string',
                        'lastname must be a string',
                        'email must be an email',
                        'password must be a string',
                        'passwordConfirmation must be a string',
                    ],
                    error: 'Bad Request',
                });
        });

        it('should return BadRequest for missing firstname', async () => {
            return await request(app.getHttpServer())
                .post('/auth/register')
                .send(registerUserDtoNoFirstname)
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: [
                        'firstname must be a string',
                    ],
                    error: 'Bad Request',
                });
        });

        it('should return BadRequest for missing lastname', async () => {
            return await request(app.getHttpServer())
                .post('/auth/register')
                .send(registerUserDtoNoLastname)
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: [
                        'lastname must be a string',
                    ],
                    error: 'Bad Request',
                });
        });

        it('should return BadRequest for missing email', async () => {
            return await request(app.getHttpServer())
                .post('/auth/register')
                .send(registerUserDtoNoEmail)
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: [
                        'email must be an email',
                    ],
                    error: 'Bad Request',
                });
        });

        it('should return BadRequest for missing password', async () => {
            return await request(app.getHttpServer())
                .post('/auth/register')
                .send(registerUserDtoNoPassword)
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: [
                        'password must be a string',
                    ],
                    error: 'Bad Request',
                });
        });

        it('should return BadRequest for missing passwordConfirmation', async () => {
            return await request(app.getHttpServer())
                .post('/auth/register')
                .send(registerUserDtoNoPasswordConfirmation)
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: [
                        'passwordConfirmation must be a string',
                    ],
                    error: 'Bad Request',
                });
        });

        it('should return BadRequest for an invalid email and a too-short password', async () => {
            return await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...getJamesSmithRegisterUserDto(), email: 'not-an-email', password: 'short', passwordConfirmation: 'short' })
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: [
                        'email must be an email',
                        'password must be longer than or equal to 8 characters',
                    ],
                    error: 'Bad Request',
                });
        });

        it('should return Conflict for existing user', async () => {
            const registerUserDto: RegisterUserDto = getJamesSmithRegisterUserDto();
            registerUserDto.password = await hash(registerUserDto.password, 12);
            const user = userRepository.create({ ...registerUserDto, createdAt: new Date() });
            await userRepository.save(user);

            user.emailVerified = true;
            await userRepository.save(user);

            return await request(app.getHttpServer())
                .post('/auth/register')
                .send(registerUserDtoPasswordsNotMatching)
                .expect(HttpStatus.CONFLICT)
                .expect({
                    statusCode: HttpStatus.CONFLICT,
                    message: RETURN_MESSAGES.CONFLICT.EMAIL_ALREADY_REGISTERED,
                });
        });

        it('should return BadRequest for non-matching passwords', () => {
            return request(app.getHttpServer())
                .post('/auth/register')
                .send(registerUserDtoPasswordsNotMatching)
                .expect(HttpStatus.BAD_REQUEST)
                .expect({
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: RETURN_MESSAGES.BAD_REQUEST.PASSWORD_MISMATCH,
                });
        });

    });
});
