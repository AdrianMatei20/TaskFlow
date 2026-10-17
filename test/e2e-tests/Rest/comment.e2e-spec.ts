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
import { ProjectRole } from "../../../src/resources/project/enums/project-role";

import { ProjectService } from "../../../src/resources/project/project.service";
import { UserService } from "../../../src/resources/user/user.service";
import { LoggerService } from "../../../src/logger/logger.service";

import { RETURN_MESSAGES } from "../../../src/constants/return-messages";
import { getRonaldClarkRegisterUserDto, getLisaMitchellRegisterUserDto, getMichelleJohnsonRegisterUserDto, getJohnThomasRegisterUserDto } from "../../data/register-user";
import { LogInUserDto } from "../../../src/auth/dto/log-in-user.dto";
import { CreateProjectDto } from "src/resources/project/dto/create-project.dto";
import { AssignUserDto } from "src/resources/project/dto/assign-user.dto";
import { RegisterUserDto } from "src/resources/user/dto/register-user.dto";
import { CreateCommentDto } from "src/resources/comment/dto/create-comment.dto";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { hash } from 'bcrypt';
import { CacheService } from "src/cache/cache.service";

describe('CommentController (e2e)', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let projectRepository: Repository<Project>;
    let userProjectRoleRepository: Repository<UserProjectRole>;
    let issueRepository: Repository<Issue>;
    let commentRepository: Repository<Comment>;

    let ownerCookie: string;
    let editorCookie: string;
    let viewerCookie: string;
    let outsiderCookie: string;

    let issueId: string;

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
                TypeOrmModule.forFeature([User, UserProjectRole, Project, Issue, Comment, ResetPassword, Log]),
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
        commentRepository = moduleFixture.get<Repository<Comment>>(getRepositoryToken(Comment));

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
        const outsider = await registerAndVerify(getJohnThomasRegisterUserDto());

        const login = async (email: string): Promise<string> => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email, password: 'P@ssword123' } as LogInUserDto)
                .expect(HttpStatus.CREATED);
            return res.headers['set-cookie'];
        };

        ownerCookie = await login(owner.email);

        const createProjectDto: CreateProjectDto = { name: 'Comment Test Project', description: 'For comment e2e tests.' };
        const createProjectRes = await request(app.getHttpServer())
            .post('/project')
            .send(createProjectDto)
            .set('Cookie', ownerCookie);
        const projectId = createProjectRes.body.data.id;

        const project: Project = await projectRepository.findOne({ where: { id: projectId } });

        const assign = async (user: User, projectRole: ProjectRole) => {
            const dto: AssignUserDto = { user, project, projectRole, createdAt: new Date() };
            await userProjectRoleRepository.save(userProjectRoleRepository.create(dto));
        };
        await assign(editor, ProjectRole.EDITOR);
        await assign(viewer, ProjectRole.VIEWER);

        editorCookie = await login(editor.email);
        viewerCookie = await login(viewer.email);
        outsiderCookie = await login(outsider.email);

        const createIssueRes = await request(app.getHttpServer())
            .post('/issue')
            .send({ projectId, title: 'Issue for comments', description: 'Desc' })
            .set('Cookie', ownerCookie);
        issueId = createIssueRes.body.data.id;
    }, 20000);

    afterEach(async () => {
        await commentRepository.clear();
        await issueRepository.clear();
        await userProjectRoleRepository.clear();
        await projectRepository.clear();
        await userRepository.clear();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /comment', () => {

        it('should create a comment for a project viewer (any member may comment)', async () => {
            const dto: CreateCommentDto = { issueId, body: 'I can reproduce this.' };

            const response = await request(app.getHttpServer())
                .post('/comment')
                .send(dto)
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body.message).toBe(RETURN_MESSAGES.CREATED.COMMENT);
            expect(response.body.data).toEqual(expect.objectContaining({
                id: expect.any(String),
                issueId,
                body: dto.body,
            }));
        });

        it('should return 403 Forbidden for a non-member', async () => {
            const response = await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId, body: 'Should fail.' })
                .set('Cookie', outsiderCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
        });

        it('should return 400 BadRequest for missing body', async () => {
            const response = await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body.message).toEqual(['body must be a string']);
        });

    });

    describe('GET /comment', () => {

        it('should list comments for a project member', async () => {
            await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId, body: 'First comment.' })
                .set('Cookie', editorCookie);

            const response = await request(app.getHttpServer())
                .get('/comment')
                .query({ issueId })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data).toHaveLength(1);
        });

    });

    describe('PATCH /comment/:id', () => {

        it('should let the author edit their own comment', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId, body: 'Original.' })
                .set('Cookie', viewerCookie);
            const commentId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/comment/${commentId}`)
                .send({ body: 'Edited.' })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data.body).toBe('Edited.');
        });

        it('should return 403 Forbidden for a different member who is not the author', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId, body: 'Original.' })
                .set('Cookie', viewerCookie);
            const commentId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/comment/${commentId}`)
                .send({ body: 'Should fail.' })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
            expect(response.body.message).toBe(RETURN_MESSAGES.FORBIDDEN.NOT_COMMENT_AUTHOR);
        });

        it('should let the project owner edit someone else\'s comment', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId, body: 'Original.' })
                .set('Cookie', viewerCookie);
            const commentId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .patch(`/comment/${commentId}`)
                .send({ body: 'Edited by owner.' })
                .set('Cookie', ownerCookie);

            expect(response.status).toBe(HttpStatus.OK);
        });

    });

    describe('DELETE /comment/:id', () => {

        it('should let the author delete their own comment', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId, body: 'To be deleted.' })
                .set('Cookie', viewerCookie);
            const commentId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .delete(`/comment/${commentId}`)
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.message).toBe(RETURN_MESSAGES.OK.COMMENT_DELETED);

            const count = await commentRepository.count();
            expect(count).toBe(0);
        });

        it('should return 403 Forbidden for a different member who is not the author', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/comment')
                .send({ issueId, body: 'Should survive.' })
                .set('Cookie', viewerCookie);
            const commentId = createRes.body.data.id;

            const response = await request(app.getHttpServer())
                .delete(`/comment/${commentId}`)
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
        });

    });

});
