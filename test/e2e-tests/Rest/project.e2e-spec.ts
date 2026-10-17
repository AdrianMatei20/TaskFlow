import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { PassportModule } from "@nestjs/passport";

import { DataSource, Repository } from "typeorm";
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
import { ProjectRole } from "../../../src/resources/project/enums/project-role";

import { ProjectService } from "../../../src/resources/project/project.service";
import { UserService } from "../../../src/resources/user/user.service";
import { LoggerService } from "../../../src/logger/logger.service";

import { RETURN_MESSAGES } from "../../../src/constants/return-messages";
import { getJamesSmithRegisterUserDto } from "../../data/register-user";
import { LogInUserDto } from "../../../src/auth/dto/log-in-user.dto";
import { createProjectDto, createProjectDtoEmpty, projectOne } from "../../data/projects";
import { userJamesSmith } from "../../data/users";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { hash } from 'bcrypt';
import { CacheService } from "src/cache/cache.service";
import { invalidUUID } from "test/data/UUIDs";

describe('ProjectController (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: Repository<Project>;
    let userRepository: Repository<User>;
    let logInRegularUserDto: LogInUserDto;
    let logInAdminDto: LogInUserDto;
    let logInUnknownDto: LogInUserDto;
    let mockCacheService: any;

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
                ProjectService,
                UserService,
                LoggerService,
                {
                    provide: CacheService,
                    useValue: mockCacheService,
                },
            ],
        }).compile();

        dataSource = moduleFixture.get<DataSource>(DataSource);

        dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

        app = moduleFixture.createNestApplication();

        userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
        projectRepository = moduleFixture.get<Repository<Project>>(getRepositoryToken(Project));

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
        mockCacheService = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
        };

        const registerRegularUserDto = getJamesSmithRegisterUserDto();

        const regularUser = userRepository.create({ ...registerRegularUserDto, password: await hash(registerRegularUserDto.password, 12), createdAt: new Date() });
        await userRepository.save(regularUser);
        regularUser.emailVerified = true;
        await userRepository.update(regularUser.id, regularUser);

        const registerAdminDto = getJamesSmithRegisterUserDto();
        registerAdminDto.email = 'admin@taskflow.com';

        const admin = userRepository.create({ ...registerAdminDto, password: await hash(registerAdminDto.password, 12), createdAt: new Date() });
        await userRepository.save(admin);
        admin.emailVerified = true;
        admin.globalRole = GlobalRole.ADMIN;
        await userRepository.update(admin.id, admin);

        const registerUnknownUserDto = getJamesSmithRegisterUserDto();
        registerUnknownUserDto.email = 'unknown@fakemail.com';

        const unknownUser = userRepository.create({ ...registerUnknownUserDto, password: await hash(registerUnknownUserDto.password, 12), createdAt: new Date() });
        await userRepository.save(unknownUser);
        unknownUser.emailVerified = true;
        unknownUser.globalRole = GlobalRole.UNKNOWN_ROLE;
        await userRepository.update(unknownUser.id, unknownUser);

        logInRegularUserDto = {
            email: registerRegularUserDto.email,
            password: registerRegularUserDto.password,
        }

        logInAdminDto = {
            email: registerAdminDto.email,
            password: registerAdminDto.password,
        }

        logInUnknownDto = {
            email: registerUnknownUserDto.email,
            password: registerUnknownUserDto.password,
        }
    });

    afterEach(async () => {
        await request(app.getHttpServer())
            .get('/auth/logout');
        await userRepository.clear();
        await projectRepository.clear();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /project', () => {

        it('should return Unauthorized if user is not logged in', async () => {
            return await request(app.getHttpServer())
                .post('/project')
                .expect(HttpStatus.UNAUTHORIZED)
                .expect({
                    statusCode: HttpStatus.UNAUTHORIZED,
                    message: RETURN_MESSAGES.UNAUTHORIZED,
                });
        });

        it('should create project for logged in admin', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInAdminDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer())
                .post('/project')
                .send(createProjectDto)
                .set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body.statusCode).toBe(HttpStatus.CREATED);
            expect(response.body.message).toBe(RETURN_MESSAGES.CREATED.PROJECT);
            expect(response.body.data).toEqual(
                expect.objectContaining({
                    id: expect.any(String),
                    name: createProjectDto.name,
                    description: createProjectDto.description,
                    createdAt: expect.any(String),
                    owner: expect.objectContaining({
                        id: expect.any(String),
                        firstname: expect.any(String),
                        lastname: expect.any(String),
                        createdAt: expect.any(String),
                        email: expect.any(String),
                        projectRole: ProjectRole.OWNER,
                    }),
                    members: expect.any(Array),
                })
            );

            const projectCount: number = await projectRepository.count();

            expect(projectCount).toBe(1);

            const project: Project = await projectRepository.findOne({
                where: {
                    name: createProjectDto.name,
                    description: createProjectDto.description,
                }
            });

            expect(project).not.toBeNull();
        });

        it('should create project for regular logged in user', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInRegularUserDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer())
                .post('/project')
                .send(createProjectDto)
                .set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body.statusCode).toBe(HttpStatus.CREATED);
            expect(response.body.message).toBe(RETURN_MESSAGES.CREATED.PROJECT);
            expect(response.body.data).toEqual(
                expect.objectContaining({
                    id: expect.any(String),
                    name: createProjectDto.name,
                    description: createProjectDto.description,
                    createdAt: expect.any(String),
                    owner: expect.objectContaining({
                        id: expect.any(String),
                        firstname: expect.any(String),
                        lastname: expect.any(String),
                        createdAt: expect.any(String),
                        email: expect.any(String),
                        projectRole: ProjectRole.OWNER,
                    }),
                    members: expect.any(Array),
                })
            );

            const projectCount: number = await projectRepository.count();

            expect(projectCount).toBe(1);

            const project: Project = await projectRepository.findOne({
                where: {
                    name: createProjectDto.name,
                    description: createProjectDto.description,
                }
            });

            expect(project).not.toBeNull();
        });

        it('should return 403 Forbidden for user with unknown role', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInUnknownDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer())
                .post('/project')
                .send(createProjectDto)
                .set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
            expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
            expect(response.body.message).toBe(RETURN_MESSAGES.FORBIDDEN.INCORRECT_ROLE);
        });

        it('should return 400 BadRequest for missing params', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInRegularUserDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer())
                .post('/project')
                .send(createProjectDtoEmpty)
                .set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.statusCode).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual(['name must be a string', 'description must be a string']);
        });

        // Postgres would reject a name longer than the 25-char column with a 500; the pipe turns it into a 400.
        it('should return 400 BadRequest for a name longer than the column allows', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInRegularUserDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer())
                .post('/project')
                .send({ name: 'x'.repeat(26), description: 'Too long a name.' })
                .set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual(['name must be shorter than or equal to 25 characters']);
            expect(await projectRepository.count()).toBe(0);
        });

    });

    describe('GET /project', () => {

        it('should return Unauthorized if user is not logged in', async () => {
            return await request(app.getHttpServer())
                .get('/project')
                .expect(HttpStatus.UNAUTHORIZED)
                .expect({
                    statusCode: HttpStatus.UNAUTHORIZED,
                    message: RETURN_MESSAGES.UNAUTHORIZED,
                });
        });

    });

    describe('GET /project/:id', () => {

        it('should return Unauthorized if user is not logged in', async () => {
            return await request(app.getHttpServer())
                .get(`/project/${projectOne.id}`)
                .expect(HttpStatus.UNAUTHORIZED)
                .expect({
                    statusCode: HttpStatus.UNAUTHORIZED,
                    message: RETURN_MESSAGES.UNAUTHORIZED,
                });
        });

        it('should return 400 BadRequest for invalid UUID', async () => {
            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send(logInRegularUserDto)
                .expect(HttpStatus.CREATED);

            const cookie = loginResponse.headers['set-cookie'];

            const response = await request(app.getHttpServer())
                .get(`/project/${invalidUUID}`)
                .set('Cookie', cookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.statusCode).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toBe(RETURN_MESSAGES.BAD_REQUEST.INVALID_PROJECT_ID);
        });

    });
});
