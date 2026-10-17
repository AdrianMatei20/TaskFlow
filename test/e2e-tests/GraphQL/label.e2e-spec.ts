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

describe('GraphQL label (e2e)', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let projectRepository: Repository<Project>;
    let userProjectRoleRepository: Repository<UserProjectRole>;
    let labelRepository: Repository<Label>;

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

        const createProjectDto: CreateProjectDto = { name: 'GQL Label Test Project', description: 'For label GraphQL e2e tests.' };
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

    describe('createLabel mutation', () => {

        it('should create a label for a project editor', async () => {
            const mutation = `
                mutation createLabel($input: CreateLabelDto!) {
                    createLabel(input: $input) {
                        id
                        name
                        color
                        projectId
                    }
                }
            `;
            const variables = { input: { projectId, name: 'frontend', color: '#3b82f6' } };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors).not.toBeDefined();
            expect(response.body.data.createLabel).toEqual(expect.objectContaining({
                id: expect.any(String),
                name: 'frontend',
                color: '#3b82f6',
                projectId,
            }));
        });

        it('should return a Forbidden error for a project viewer', async () => {
            const mutation = `
                mutation createLabel($input: CreateLabelDto!) {
                    createLabel(input: $input) { id }
                }
            `;
            const variables = { input: { projectId, name: 'should-fail', color: '#000000' } };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE);
        });

        // The GraphQL schema only knows `color: String!`; the format rule comes from the DTO via the global ValidationPipe.
        it('should return a BadRequest error for a color that is not #rrggbb', async () => {
            const mutation = `
                mutation createLabel($input: CreateLabelDto!) {
                    createLabel(input: $input) { id }
                }
            `;
            const variables = { input: { projectId, name: 'frontend', color: 'blue' } };

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors[0].extensions.originalError).toEqual({
                statusCode: HttpStatus.BAD_REQUEST,
                message: ['color must be a hex color in the format #rrggbb'],
                error: 'Bad Request',
            });
            expect(response.body.data).toBeNull();
        });

    });

    describe('labels query', () => {

        it('should list labels for a project member', async () => {
            await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);

            const query = `
                query labels($projectId: String!) {
                    labels(projectId: $projectId) {
                        id
                        name
                    }
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query, variables: { projectId } })
                .set('Cookie', viewerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data.labels).toHaveLength(1);
        });

    });

    describe('removeLabel mutation', () => {

        it('should delete the label for the project owner', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);
            const labelId = createRes.body.data.id;

            const mutation = `
                mutation removeLabel($id: String!) {
                    removeLabel(id: $id)
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables: { id: labelId } })
                .set('Cookie', ownerCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.data.removeLabel).toBe(true);

            const count = await labelRepository.count();
            expect(count).toBe(0);
        });

        it('should return a Forbidden error for an editor', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/label')
                .send({ projectId, name: 'frontend', color: '#3b82f6' })
                .set('Cookie', editorCookie);
            const labelId = createRes.body.data.id;

            const mutation = `
                mutation removeLabel($id: String!) {
                    removeLabel(id: $id)
                }
            `;

            const response = await request(app.getHttpServer())
                .post('/graphql')
                .send({ query: mutation, variables: { id: labelId } })
                .set('Cookie', editorCookie);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.FORBIDDEN.INSUFFICIENT_PROJECT_ROLE);
        });

    });

});
