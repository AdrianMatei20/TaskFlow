import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { PassportModule } from "@nestjs/passport";

import { Repository } from "typeorm";
import { getRepositoryToken, TypeOrmModule } from "@nestjs/typeorm";

import { AppModule } from "../../../src/app.module";
import { LoggerController } from "../../../src/logger/logger.controller";

import { User } from "../../../src/resources/user/entities/user.entity";
import { UserProjectRole } from "../../../src/resources/project/entities/user-project-role.entity";
import { Project } from "../../../src/resources/project/entities/project.entity";
import { Issue } from "../../../src/resources/issue/entities/issue.entity";
import { Label } from "../../../src/resources/label/entities/label.entity";
import { Comment } from "../../../src/resources/comment/entities/comment.entity";
import { ResetPassword } from "../../../src/auth/reset-password/reset-password.entity";
import { Log } from "../../../src/logger/entities/log.entity";
import { GlobalRole } from "../../../src/resources/user/enums/global-role";

import { LoggerService } from "../../../src/logger/logger.service";
import { UserService } from "../../../src/resources/user/user.service";
import { ResetPasswordService } from "../../../src/auth/reset-password/reset-password.service";
import { TokenService } from "../../../src/services/token/token.service";

import { RETURN_MESSAGES } from "../../../src/constants/return-messages";
import { LOG_CONTEXTS } from "../../../src/constants/log-contexts";
import { LOG_MESSAGES } from "../../../src/constants/log-messages";
import { getJamesSmithRegisterUserDto } from "../../data/register-user";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { hash } from 'bcrypt';
import { JwtService } from "@nestjs/jwt";
import { LogInUserDto } from "src/auth/dto/log-in-user.dto";
import { getLogs } from "../../data/logs";

describe('LoggerController (e2e)', () => {
    let app: INestApplication;
    let loggerRepository: Repository<Log>;
    let userRepository: Repository<User>;
    let logInRegularUserDto: LogInUserDto;
    let logInAdminDto: LogInUserDto;

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
            controllers: [LoggerController],
            providers: [
                LoggerService,
                UserService,
                ResetPasswordService,
                TokenService,
                JwtService,
            ],
        }).compile();

        dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

        app = moduleFixture.createNestApplication();

        loggerRepository = moduleFixture.get<Repository<Log>>(getRepositoryToken(Log));
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

        const registerRegularUserDto = getJamesSmithRegisterUserDto();

        const regularUser = userRepository.create({ ...registerRegularUserDto, password: await hash(registerRegularUserDto.password, 12), createdAt: new Date() });
        await userRepository.save(regularUser);
        regularUser.emailVerified = true;
        await userRepository.save(regularUser);

        const registerAdminDto = getJamesSmithRegisterUserDto();
        registerAdminDto.email = 'admin@taskflow.com';

        const admin = userRepository.create({ ...registerAdminDto, password: await hash(registerAdminDto.password, 12), createdAt: new Date() });
        await userRepository.save(admin);
        admin.emailVerified = true;
        admin.globalRole = GlobalRole.ADMIN;
        await userRepository.save(admin);

        logInRegularUserDto = {
            email: registerRegularUserDto.email,
            password: registerRegularUserDto.password,
        }

        logInAdminDto = {
            email: registerAdminDto.email,
            password: registerAdminDto.password,
        }
    });

    afterAll(async () => {
        await app.close();
    });

    afterEach(async () => {
        await request(app.getHttpServer())
            .get('/auth/logout');
        await loggerRepository.clear();
    });

    describe('/logger (GET)', () => {

        it('should return Unauthorized if user is not logged in', async () => {
            return await request(app.getHttpServer())
                .get('/logger')
                .expect(HttpStatus.UNAUTHORIZED)
                .expect({
                    statusCode: HttpStatus.UNAUTHORIZED,
                    message: RETURN_MESSAGES.UNAUTHORIZED,
                });
        });

        it('should return Forbidden if user is logged in but is not admin', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInRegularUserDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            return await request(app.getHttpServer())
                .get('/logger')
                .set('Cookie', cookie)
                .expect(HttpStatus.FORBIDDEN)
                .expect({
                    statusCode: HttpStatus.FORBIDDEN,
                    message: 'You do not have the required role to perform this action.',
                });
        });

        it('should return empty list if there are no logs', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            return await request(app.getHttpServer())
                .get('/logger')
                .set('Cookie', cookie)
                .expect(HttpStatus.OK)
                .expect({
                    statusCode: HttpStatus.OK,
                    message: '0 logs found',
                    data: [],
                });
        });

        it('should return one log if there is only one log', async () => {
            const logDto = { level: 'level', message: 'message', context: 'context', metadata: 'metadata', trace: 'trace', timestamp: new Date('2025-03-10T18:10:24.878Z') };
            const log = loggerRepository.create(logDto);
            await loggerRepository.save(log);

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('1 log found');
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    })
                ])
            );
        });

        it('should return all logs sorted by timestamps in descending order', async () => {
            const logs = getLogs();
            await Promise.all(
                logs.map(async (logDto) => {
                    const log = loggerRepository.create(logDto);
                    await loggerRepository.save(log);
                })
            );

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('20 logs found');
            expect(response.body.data).toHaveLength(20);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );

            const timestamps = response.body.data.map((log) => new Date(log.timestamp));
            const isDescending = timestamps.every((ts, i, arr) => i === 0 || ts <= arr[i - 1]);
            expect(isDescending).toBe(true);
        });

        it('should filter by level', async () => {
            const logs = getLogs();
            await Promise.all(
                logs.map(async (logDto) => {
                    const log = loggerRepository.create(logDto);
                    await loggerRepository.save(log);
                })
            );

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            let response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ level: "error" });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('4 logs found');
            expect(response.body.data).toHaveLength(4);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );

            response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ level: "warn" });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('5 logs found');
            expect(response.body.data).toHaveLength(5);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );

            response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ level: "info" });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('8 logs found');
            expect(response.body.data).toHaveLength(8);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );

            response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ level: "debug" });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('3 logs found');
            expect(response.body.data).toHaveLength(3);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );
        });

        it('should filter by date', async () => {
            const logs = getLogs();
            await Promise.all(
                logs.map(async (logDto) => {
                    const log = loggerRepository.create(logDto);
                    await loggerRepository.save(log);
                })
            );

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ fromDate: '2005-01-01T00:00:00.000Z', toDate: '2010-12-31T23:59:59.999Z' });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('6 logs found');
            expect(response.body.data).toHaveLength(6);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );
        });

        it('should return all logs sorted by timestamps in ascending order', async () => {
            const logs = getLogs();
            await Promise.all(
                logs.map(async (logDto) => {
                    const log = loggerRepository.create(logDto);
                    await loggerRepository.save(log);
                })
            );

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ order: 'ASC' });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('20 logs found');
            expect(response.body.data).toHaveLength(20);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );

            const timestamps = response.body.data.map((log) => new Date(log.timestamp));
            const isAscending = timestamps.every((ts, i, arr) => i === 0 || ts >= arr[i - 1]);
            expect(isAscending).toBe(true);
        });

        it('should return all logs sorted by context in descending order', async () => {
            const logs = getLogs();
            await Promise.all(
                logs.map(async (logDto) => {
                    const log = loggerRepository.create(logDto);
                    await loggerRepository.save(log);
                })
            );

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ sortBy: 'context' });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('20 logs found');
            expect(response.body.data).toHaveLength(20);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );

            const contexts = response.body.data.map((log) => log.context);
            const isDescending = contexts.every((ctx, i, arr) => i === 0 || arr[i - 1].localeCompare(ctx) >= 0);
            expect(isDescending).toBe(true);
        });

        it('should return all logs sorted by context in ascending order', async () => {
            const logs = getLogs();
            await Promise.all(
                logs.map(async (logDto) => {
                    const log = loggerRepository.create(logDto);
                    await loggerRepository.save(log);
                })
            );

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer()).get('/logger').set('Cookie', cookie).query({ sortBy: 'context', order: 'ASC' });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.statusCode).toBe(HttpStatus.OK);
            expect(response.body.message).toBe('20 logs found');
            expect(response.body.data).toHaveLength(20);
            expect(response.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        level: expect.any(String),
                        message: expect.any(String),
                        context: expect.any(String),
                        metadata: expect.any(String),
                        trace: expect.any(String),
                        timestamp: expect.any(String),
                    }),
                ])
            );

            const contexts = response.body.data.map((log) => log.context);
            const isAscending = contexts.every((ctx, i, arr) => i === 0 || arr[i - 1].localeCompare(ctx) <= 0);
            expect(isAscending).toBe(true);
        });

    });

    describe('ValidationPipe logging', () => {

        // The pipe writes its log row without awaiting it (exceptionFactory is synchronous), so poll briefly.
        const findValidationLog = async (): Promise<Log | null> => {
            for (let attempt = 0; attempt < 20; attempt++) {
                const log = await loggerRepository.findOne({ where: { context: LOG_CONTEXTS.ValidationPipe } });
                if (log) return log;
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            return null;
        };

        it('should log a WARN entry for an invalid body without logging submitted values', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ firstname: 'Adrian', lastname: 'Matei', email: 'not-an-email', password: 'secret1', passwordConfirmation: 'secret1' })
                .expect(HttpStatus.BAD_REQUEST);

            const log = await findValidationLog();

            expect(log).not.toBeNull();
            expect(log.level).toBe('WARN');
            expect(log.message).toBe(LOG_MESSAGES.VALIDATION.FAILED('RegisterUserDto', ['email', 'password']));

            const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
            expect(metadata).toEqual({
                dto: 'RegisterUserDto',
                failures: [
                    { property: 'email', constraints: ['isEmail'] },
                    { property: 'password', constraints: ['minLength'] },
                ],
            });
            expect(JSON.stringify(log)).not.toContain('secret1');
            expect(JSON.stringify(log)).not.toContain('not-an-email');
        });

    });
});
