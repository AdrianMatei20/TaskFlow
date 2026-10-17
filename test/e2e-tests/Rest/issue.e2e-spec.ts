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
import { ProjectRole } from "../../../src/resources/project/enums/project-role";

import { ProjectService } from "../../../src/resources/project/project.service";
import { UserService } from "../../../src/resources/user/user.service";
import { LoggerService } from "../../../src/logger/logger.service";

import { RETURN_MESSAGES } from "../../../src/constants/return-messages";
import { getRonaldClarkRegisterUserDto, getMaryWrightRegisterUserDto, getLisaMitchellRegisterUserDto, getMichelleJohnsonRegisterUserDto, getJohnThomasRegisterUserDto } from "../../data/register-user";
import { LogInUserDto } from "../../../src/auth/dto/log-in-user.dto";
import { CreateProjectDto } from "src/resources/project/dto/create-project.dto";
import { AssignUserDto } from "src/resources/project/dto/assign-user.dto";
import { RegisterUserDto } from "src/resources/user/dto/register-user.dto";
import { CreateIssueDto } from "src/resources/issue/dto/create-issue.dto";
import { IssuePriority } from "src/resources/issue/enums/issue-priority";
import { IssueStatus } from "src/resources/issue/enums/issue-status";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { hash } from 'bcrypt';
import { CacheService } from "src/cache/cache.service";

describe('IssueController (e2e)', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let projectRepository: Repository<Project>;
    let userProjectRoleRepository: Repository<UserProjectRole>;
    let issueRepository: Repository<Issue>;

    let ownerCookie: string;
    let editorCookie: string;
    let viewerCookie: string;
    let outsiderCookie: string;

    let projectId: string;

    const mockCacheService = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
    };

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
                TypeOrmModule.forFeature([User, UserProjectRole, Project, Issue, ResetPassword, Log]),
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
        issueRepository = moduleFixture.get<Repository<Issue>>(getRepositoryToken(Issue));

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
        const admin = await registerAndVerify(getMaryWrightRegisterUserDto());
        const editor = await registerAndVerify(getLisaMitchellRegisterUserDto());
        const viewer = await registerAndVerify(getMichelleJohnsonRegisterUserDto());
        const outsider = await registerAndVerify(getJohnThomasRegisterUserDto());

        const login = async (email: string): Promise<string> => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email, password: 'P@ssword123' } as LogInUserDto)
                .expect(HttpStatus.CREATED);
            return res.headers['set-cookie'];
        };

        ownerCookie = await login(owner.email);

        const createProjectDto: CreateProjectDto = { name: 'Issue Test Project', description: 'For issue e2e tests.' };
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
        await assign(admin, ProjectRole.ADMIN);
        await assign(editor, ProjectRole.EDITOR);
        await assign(viewer, ProjectRole.VIEWER);

        editorCookie = await login(editor.email);
        viewerCookie = await login(viewer.email);
        outsiderCookie = await login(outsider.email);
    }, 20000);

    afterEach(async () => {
        await issueRepository.clear();
        await userProjectRoleRepository.clear();
        await projectRepository.clear();
        await userRepository.clear();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /issue', () => {

        it('should create an issue for a project editor', async () => {
            const dto: CreateIssueDto = { projectId, title: 'Bug in login', description: 'Login fails on Safari.' };

            const response = await request(app.getHttpServer())
                .post('/issue')
                .send(dto)
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body.message).toBe(RETURN_MESSAGES.CREATED.ISSUE);
            expect(response.body.data).toEqual(expect.objectContaining({
                id: expect.any(String),
                projectId,
                title: dto.title,
                description: dto.description,
                status: 'TODO',
            }));

            const count = await issueRepository.count();
            expect(count).toBe(1);
        });

        it('should return 403 Forbidden for a project viewer', async () => {
            const dto: CreateIssueDto = { projectId, title: 'Should fail', description: 'Viewer cannot create.' };

            const response = await request(app.getHttpServer())
                .post('/issue')
                .send(dto)
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
            expect(response.body.message).toBe(RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE);
        });

        it('should return 401 Unauthorized if not logged in', async () => {
            const response = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'x', description: 'y' });

            expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
        });

        it('should return 400 BadRequest for missing properties', async () => {
            const response = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Missing description' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual(['description must be a string']);
        });

        it('should return 400 BadRequest listing every invalid property', async () => {
            const response = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId: 'not-a-uuid', title: 'x'.repeat(201), description: 'Desc', priority: 'URGENT', labelIds: ['not-a-uuid'] })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual({
                statusCode: HttpStatus.BAD_REQUEST,
                message: [
                    'projectId must be a UUID',
                    'title must be shorter than or equal to 200 characters',
                    `priority must be one of the following values: ${Object.values(IssuePriority).join(', ')}`,
                    'each value in labelIds must be a UUID',
                ],
                error: 'Bad Request',
            });
            expect(await issueRepository.count()).toBe(0);
        });

        it('should strip properties that are not part of the DTO', async () => {
            const response = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Title', description: 'Desc', status: 'DONE', createdAt: '2000-01-01T00:00:00.000Z' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body.data.status).toBe('TODO');
            expect(response.body.data.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
        });

        it('should convert an ISO dueDate string into a date', async () => {
            const response = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Title', description: 'Desc', dueDate: '2026-12-01T00:00:00.000Z' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body.data.dueDate).toBe('2026-12-01T00:00:00.000Z');
        });

        it('should return 400 BadRequest for an invalid dueDate', async () => {
            const response = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Title', description: 'Desc', dueDate: 'next friday' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual(['dueDate must be a Date instance']);
        });

    });

    describe('GET /issue', () => {

        it('should list issues for a project member', async () => {
            await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);

            const response = await request(app.getHttpServer())
                .get('/issue')
                .query({ projectId })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data).toHaveLength(1);
        });

        it('should return 403 Forbidden for a non-member', async () => {
            const response = await request(app.getHttpServer())
                .get('/issue')
                .query({ projectId })
                .set('Cookie', outsiderCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
            expect(response.body.message).toBe(RETURN_MESSAGES.FORBIDDEN.NOT_A_PROJECT_MEMBER);
        });

    });

    describe('GET /issue/:id', () => {

        it('should return the issue for a project member', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .get(`/issue/${issueId}`)
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data.id).toBe(issueId);
        });

        it('should return 404 NotFound for a non-existent issue', async () => {
            const response = await request(app.getHttpServer())
                .get('/issue/00000000-0000-4000-8000-000000000000')
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.NOT_FOUND);
            expect(response.body.message).toBe(RETURN_MESSAGES.NOT_FOUND.ISSUE);
        });

        it('should return 400 BadRequest for an invalid uuid', async () => {
            const response = await request(app.getHttpServer())
                .get('/issue/not-a-uuid')
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toBe(RETURN_MESSAGES.BAD_REQUEST.INVALID_ISSUE_ID);
        });

    });

    describe('PATCH /issue/:id', () => {

        it('should update the issue status for an editor', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/issue/${issueId}`)
                .send({ status: 'IN_PROGRESS' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data.status).toBe('IN_PROGRESS');
        });

        it('should return 403 Forbidden for a viewer', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/issue/${issueId}`)
                .send({ status: 'DONE' })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
        });

        it('should return 400 BadRequest for null on a non-nullable field', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/issue/${issueId}`)
                .send({ title: null, status: 'FINISHED' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual([
                'title must be a string',
                `status must be one of the following values: ${Object.values(IssueStatus).join(', ')}`,
            ]);
        });

        it('should accept null to clear a nullable field', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1', dueDate: '2026-12-01T00:00:00.000Z' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/issue/${issueId}`)
                .send({ dueDate: null })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data.dueDate).toBeNull();
        });

    });

    describe('DELETE /issue/:id', () => {

        it('should return 403 Forbidden for an editor', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .delete(`/issue/${issueId}`)
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
            expect(response.body.message).toBe(RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE);
        });

        it('should delete the issue for the project owner', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .delete(`/issue/${issueId}`)
                .set('Cookie', ownerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.message).toBe(RETURN_MESSAGES.OK.ISSUE_DELETED);

            const count = await issueRepository.count();
            expect(count).toBe(0);
        });

    });

});
