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

import { IssueService } from "../../../src/resources/issue/issue.service";
import { RETURN_MESSAGES } from "../../../src/constants/return-messages";
import { getRonaldClarkRegisterUserDto, getLisaMitchellRegisterUserDto, getMichelleJohnsonRegisterUserDto } from "../../data/register-user";
import { LogInUserDto } from "../../../src/auth/dto/log-in-user.dto";
import { CreateProjectDto } from "src/resources/project/dto/create-project.dto";
import { AssignUserDto } from "src/resources/project/dto/assign-user.dto";
import { RegisterUserDto } from "src/resources/user/dto/register-user.dto";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { hash } from 'bcrypt';
import { CacheService } from "src/cache/cache.service";

describe('GraphQL issue (e2e)', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let projectRepository: Repository<Project>;
    let userProjectRoleRepository: Repository<UserProjectRole>;
    let issueRepository: Repository<Issue>;

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

        const createProjectDto: CreateProjectDto = { name: 'GQL Issue Test Project', description: 'For issue GraphQL e2e tests.' };
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
        await issueRepository.clear();
        await userProjectRoleRepository.clear();
        await projectRepository.clear();
        await userRepository.clear();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('createIssue mutation', () => {

        it('should create an issue for a project editor', async () => {
            const mutation = `
                mutation createIssue($input: CreateIssueDto!) {
                    createIssue(input: $input) {
                        id
                        title
                        description
                        status
                        projectId
                    }
                }
            `;
            const variables = { input: { projectId, title: 'GraphQL issue', description: 'Created via GraphQL.' } };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).not.toBeDefined();
            expect(response.body.data.createIssue).toEqual(expect.objectContaining({
                id: expect.any(String),
                title: 'GraphQL issue',
                description: 'Created via GraphQL.',
                status: 'TODO',
                projectId,
            }));
        });

        it('should return a Forbidden error for a project viewer', async () => {
            const mutation = `
                mutation createIssue($input: CreateIssueDto!) {
                    createIssue(input: $input) { id }
                }
            `;
            const variables = { input: { projectId, title: 'Should fail', description: 'Viewer cannot create.' } };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).toBeDefined();
            expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE);
            expect(response.body.data).toBeNull();
        });

        it('should return an Unauthorized error if not logged in', async () => {
            const mutation = `
                mutation createIssue($input: CreateIssueDto!) {
                    createIssue(input: $input) { id }
                }
            `;
            const variables = { input: { projectId, title: 'x', description: 'y' } };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.UNAUTHORIZED);
            expect(response.body.data).toBeNull();
        });

        // `projectId: ID!` and `title: String!` satisfy the GraphQL schema; the UUID/empty rules come from the ValidationPipe.
        it('should return a BadRequest error for input that passes the schema but fails DTO validation', async () => {
            const mutation = `
                mutation createIssue($input: CreateIssueDto!) {
                    createIssue(input: $input) { id }
                }
            `;
            const variables = { input: { projectId: 'not-a-uuid', title: '', description: 'Desc' } };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors[0].extensions.originalError).toEqual({
                statusCode: HttpStatus.BAD_REQUEST,
                message: ['projectId must be a UUID', 'title should not be empty'],
                error: 'Bad Request',
            });
            expect(response.body.data).toBeNull();
        });

    });

    describe('issues query', () => {

        it('should list issues for a project member', async () => {
            await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);

            const query = `
                query issues($projectId: String!) {
                    issues(projectId: $projectId) {
                        id
                        title
                    }
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query, variables: { projectId } })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).not.toBeDefined();
            expect(response.body.data.issues).toHaveLength(1);
        });

        // Project.issues and Issue.assignee/reporter are resolved through per-request DataLoaders.
        it('should resolve nested issues and people per project, batching the queries across projects', async () => {
            const editor = await userRepository.findOne({ where: { email: getLisaMitchellRegisterUserDto().email } });
            for (const title of ['Issue 1', 'Issue 2', 'Issue 3']) {
                await request(app.getHttpServer())
                    .post('/issue')
                    .send({ projectId, title, description: 'Desc', assigneeId: editor.id })
                    .set('Cookie', editorCookie)
                    .expect(HttpStatus.CREATED);
            }
            const secondProject = await request(app.getHttpServer())
                .post('/project')
                .send({ name: 'GQL Second Project', description: 'Second project.' })
                .set('Cookie', ownerCookie);
            const secondProjectId = secondProject.body.data.id;
            await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId: secondProjectId, title: 'Other issue', description: 'Desc' })
                .set('Cookie', ownerCookie)
                .expect(HttpStatus.CREATED);

            const issueBatch = jest.spyOn(app.get(IssueService), 'findPagesByProjectIds');
            const userBatch = jest.spyOn(app.get(UserService), 'findPeopleByIds');

            const query = `
                query {
                    userProjects {
                        id
                        issues(first: 2) {
                            title
                            assignee { firstname }
                            reporter { firstname }
                        }
                    }
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query })
                .set('Cookie', ownerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).not.toBeDefined();
            const issuesByProject = Object.fromEntries(response.body.data.userProjects.map(project => [project.id, project.issues]));
            // The limit applies per project (newest first), not to the whole result
            expect(issuesByProject[projectId]).toEqual([
                { title: 'Issue 3', assignee: { firstname: editor.firstname }, reporter: { firstname: editor.firstname } },
                { title: 'Issue 2', assignee: { firstname: editor.firstname }, reporter: { firstname: editor.firstname } },
            ]);
            expect(issuesByProject[secondProjectId]).toEqual([
                { title: 'Other issue', assignee: null, reporter: { firstname: getRonaldClarkRegisterUserDto().firstname } },
            ]);
            // One batch query for both projects' issues, one for every person across all issues
            expect(issueBatch).toHaveBeenCalledTimes(1);
            expect(issueBatch.mock.calls[0][0]).toEqual(expect.arrayContaining([projectId, secondProjectId]));
            expect(userBatch).toHaveBeenCalledTimes(1);

            jest.restoreAllMocks();
        });

    });

    describe('updateIssue mutation', () => {

        it('should update the issue status for an editor', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const mutation = `
                mutation updateIssue($id: String!, $input: UpdateIssueDto!) {
                    updateIssue(id: $id, input: $input) {
                        id
                        status
                    }
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables: { id: issueId, input: { status: 'DONE' } } })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).not.toBeDefined();
            expect(response.body.data.updateIssue.status).toBe('DONE');
        });

    });

    describe('removeIssue mutation', () => {

        it('should return a Forbidden error for an editor', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const mutation = `
                mutation removeIssue($id: String!) {
                    removeIssue(id: $id)
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables: { id: issueId } })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).toBeDefined();
            expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE);
        });

        it('should delete the issue for the project owner', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/issue')
                .send({ projectId, title: 'Issue 1', description: 'Desc 1' })
                .set('Cookie', editorCookie);
            const issueId = createRes.body.data.id;

            const mutation = `
                mutation removeIssue($id: String!) {
                    removeIssue(id: $id)
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables: { id: issueId } })
                .set('Cookie', ownerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).not.toBeDefined();
            expect(response.body.data.removeIssue).toBe(true);

            const count = await issueRepository.count();
            expect(count).toBe(0);
        });

    });

});
