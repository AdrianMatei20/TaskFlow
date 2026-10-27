import { HttpStatus, INestApplication, Logger } from "@nestjs/common";
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
import { ProjectRole } from "../../../src/resources/project/enums/project-role";

import { ProjectService } from "../../../src/resources/project/project.service";
import { UserService } from "../../../src/resources/user/user.service";
import { LoggerService } from "../../../src/logger/logger.service";

import { RETURN_MESSAGES } from "../../../src/constants/return-messages";
import { LOG_CONTEXTS } from "../../../src/constants/log-contexts";
import { getRonaldClarkRegisterUserDto, getLisaMitchellRegisterUserDto, getMichelleJohnsonRegisterUserDto } from "../../data/register-user";
import { LogInUserDto } from "../../../src/auth/dto/log-in-user.dto";
import { CreateProjectDto } from "src/resources/project/dto/create-project.dto";
import { AssignUserDto } from "src/resources/project/dto/assign-user.dto";
import { RegisterUserDto } from "src/resources/user/dto/register-user.dto";
import { CreateLabelDto } from "src/resources/label/dto/create-label.dto";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { hash } from 'bcrypt';
import { CacheService } from "src/cache/cache.service";

describe('LabelController (e2e)', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let projectRepository: Repository<Project>;
    let userProjectRoleRepository: Repository<UserProjectRole>;
    let labelRepository: Repository<Label>;
    let logRepository: Repository<Log>;

    let ownerCookie: string;
    let editorCookie: string;
    let viewerCookie: string;

    let projectId: string;

    const mockCacheService = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                AppModule,
                PassportModule.register({ session: true, defaultStrategy: 'bearer' }),
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [User, UserProjectRole, Project, Issue, Label, Comment, ResetPassword, Log],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([User, UserProjectRole, Project, Label, ResetPassword, Log]),
            ],
            controllers: [LoggerController],
            providers: [
                ProjectService,
                UserService,
                LoggerService,
                { provide: CacheService, useValue: mockCacheService },
            ],
        }).compile();

        dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

        app = moduleFixture.createNestApplication();

        userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
        projectRepository = moduleFixture.get<Repository<Project>>(getRepositoryToken(Project));
        userProjectRoleRepository = moduleFixture.get<Repository<UserProjectRole>>(getRepositoryToken(UserProjectRole));
        labelRepository = moduleFixture.get<Repository<Label>>(getRepositoryToken(Label));
        logRepository = moduleFixture.get<Repository<Log>>(getRepositoryToken(Log));

        app.use(session({
            name: 'SESSION_ID',
            secret: process.env.SECRET,
            resave: false,
            saveUninitialized: false,
            rolling: true,
            cookie: { httpOnly: true, maxAge: 3 * 60 * 60 * 1000 },
        }));

        const passport = require('passport');
        app.use(passport.initialize());
        app.use(passport.session());

        await app.init();
    });

    beforeEach(async () => {
        const registerAndVerify = async (dto: RegisterUserDto) => {
            const user = userRepository.create({ ...dto, password: await hash(dto.password, 12), createdAt: new Date() });
            await userRepository.save(user);
            user.emailVerified = true;
            await userRepository.update(user.id, user);
            return user;
        };

        const owner = await registerAndVerify(getRonaldClarkRegisterUserDto());
        const editor = await registerAndVerify(getLisaMitchellRegisterUserDto());
        const viewer = await registerAndVerify(getMichelleJohnsonRegisterUserDto());

        const login = async (email: string): Promise<string> => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email, password: 'P@ssword123' } as LogInUserDto)
                .expect(HttpStatus.CREATED);
            return res.headers['set-cookie'];
        };

        ownerCookie = await login(owner.email);

        const createProjectDto: CreateProjectDto = { name: 'Label Test Project', description: 'For label e2e tests.' };
        const createRes = await request(app.getHttpServer())
            .post('/project')
            .send(createProjectDto)
            .set('Cookie', ownerCookie);
        projectId = createRes.body.data.id;

        const project: Project = await projectRepository.findOne({ where: { id: projectId } });

        const assign = async (user: User, projectRole: ProjectRole) => {
            const dto: AssignUserDto = { user, project, projectRole, createdAt: new Date() };
            await userProjectRoleRepository.save(userProjectRoleRepository.create(dto));
        };
        await assign(editor, ProjectRole.EDITOR);
        await assign(viewer, ProjectRole.VIEWER);

        editorCookie = await login(editor.email);
        viewerCookie = await login(viewer.email);
    }, 20000);

    afterEach(async () => {
        await labelRepository.clear();
        await userProjectRoleRepository.clear();
        await projectRepository.clear();
        await userRepository.clear();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /label', () => {

        it('should create a label for a project editor', async () => {
            const dto: CreateLabelDto = { projectId, name: 'frontend', color: '#3b82f6' };

            const response = await request(app.getHttpServer())
                .post('/label')
                .send(dto)
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body.message).toBe(RETURN_MESSAGES.CREATED.LABEL);
            expect(response.body.data).toEqual(expect.objectContaining({
                id: expect.any(String),
                projectId,
                name: 'frontend',
                color: '#3b82f6',
            }));
        });

        it('should return 403 Forbidden for a project viewer', async () => {
            const response = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'should-fail', color: '#000000' })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
            expect(response.body.message).toBe(RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE);
        });

        it('should return 400 BadRequest for missing properties', async () => {
            const response = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'missing-color' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual(['color must be a string']);
        });

        it('should return 400 BadRequest for a color that is not #rrggbb', async () => {
            const response = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#fff' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual(['color must be a hex color in the format #rrggbb']);
        });

    });

    describe('GET /label', () => {

        it('should list labels for a project member', async () => {
            await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);

            const response = await request(app.getHttpServer())
                .get('/label')
                .query({ projectId })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data).toHaveLength(1);
        });

        // LabelService has no try/catch around the query, so the error reaches the global AllExceptionsFilter.
        it('should return a generic 500 and log the error when the database fails', async () => {
            jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
            jest.spyOn(labelRepository, 'find').mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'));

            const response = await request(app.getHttpServer())
                .get('/label')
                .query({ projectId })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(response.body).toEqual({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: RETURN_MESSAGES.INTERNAL_SERVER_ERROR,
            });
            expect(JSON.stringify(response.body)).not.toContain('SQLITE_BUSY');

            // The filter logs without awaiting, so poll briefly for the entry.
            let log: Log = null;
            for (let attempt = 0; attempt < 20 && !log; attempt++) {
                log = await logRepository.findOne({ where: { context: LOG_CONTEXTS.AllExceptionsFilter } });
                if (!log) await new Promise(resolve => setTimeout(resolve, 50));
            }
            expect(log).toEqual(expect.objectContaining({
                level: 'ERROR',
                message: 'Unhandled error during GET /label: SQLITE_BUSY: database is locked',
                metadata: expect.objectContaining({ operation: 'GET /label', errorName: 'Error' }),
            }));

            jest.restoreAllMocks();
        });

    });

    describe('PATCH /label/:id', () => {

        it('should update the label for an editor', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);
            const labelId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/label/${labelId}`)
                .send({ name: 'backend' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data.name).toBe('backend');
        });

        it('should return 403 Forbidden for a viewer', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);
            const labelId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/label/${labelId}`)
                .send({ name: 'should-fail' })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
        });

        it('should return 400 BadRequest for invalid values', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);
            const labelId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/label/${labelId}`)
                .send({ name: 'x'.repeat(51), color: 'blue' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual([
                'name must be shorter than or equal to 50 characters',
                'color must be a hex color in the format #rrggbb',
            ]);
        });

    });

    describe('DELETE /label/:id', () => {

        it('should return 403 Forbidden for an editor', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);
            const labelId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .delete(`/label/${labelId}`)
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
        });

        it('should delete the label for the project owner', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);
            const labelId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .delete(`/label/${labelId}`)
                .set('Cookie', ownerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.message).toBe(RETURN_MESSAGES.OK.LABEL_DELETED);

            const count = await labelRepository.count();
            expect(count).toBe(0);
        });

    });

});
