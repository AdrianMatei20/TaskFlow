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

import { ProjectService } from "../../../src/resources/project/project.service";
import { UserService } from "../../../src/resources/user/user.service";
import { LoggerService } from "../../../src/logger/logger.service";

import { RETURN_MESSAGES } from "../../../src/constants/return-messages";
import { getChristopherAndersonRegisterUserDto, getJamesSmithRegisterUserDto, getJohnThomasRegisterUserDto, getLisaMitchellRegisterUserDto, getMaryWrightRegisterUserDto, getMichelleJohnsonRegisterUserDto, getRonaldClarkRegisterUserDto } from "../../data/register-user";
import { LogInUserDto } from "../../../src/auth/dto/log-in-user.dto";
import { projectFour as project4, projectOne as project1, projectThree as project3, projectTwo as project2 } from "../../data/projects";

import * as dotenv from 'dotenv';
import request from 'supertest';
import session from "express-session";
import { hash } from 'bcrypt';
import { CreateProjectDto } from "src/resources/project/dto/create-project.dto";
import { ProjectRole } from "src/resources/project/enums/project-role";
import { AssignUserDto } from "src/resources/project/dto/assign-user.dto";
import { RegisterUserDto } from "src/resources/user/dto/register-user.dto";
import { PublicProjectDto } from "src/resources/project/dto/public-project.dto";
import { CacheService } from "src/cache/cache.service";

describe('GraphQL project (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let projectRepository: Repository<Project>;
  let userProjectRoleRepository: Repository<UserProjectRole>;
  let userRepository: Repository<User>;
  let christopherAndersonLogInUserDto: LogInUserDto;
  let ronaldClarkLogInUserDto: LogInUserDto;
  let maryWrightLogInUserDto: LogInUserDto;
  let lisaMitchellLogInUserDto: LogInUserDto;
  let michelleJohnsonLogInUserDto: LogInUserDto;
  let johnThomasLogInUserDto: LogInUserDto;
  let logInAdminDto: LogInUserDto;
  let logInUnknownDto: LogInUserDto;
  let createdProject3: Project;
  let project1Id: string = "";
  let project2Id: string = "";
  let project3Id: string = "";
  let project4Id: string = "";
  let publicProjectDto: PublicProjectDto;

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

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
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

    app = moduleFixture.createNestApplication();

    userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    projectRepository = moduleFixture.get<Repository<Project>>(getRepositoryToken(Project));
    userProjectRoleRepository = moduleFixture.get<Repository<UserProjectRole>>(getRepositoryToken(UserProjectRole));

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
    // Create admin (James Smith)
    const registerAdminDto = getJamesSmithRegisterUserDto();
    registerAdminDto.email = 'admin@taskflow.com';
    const admin: User = userRepository.create({ ...registerAdminDto, password: await hash(registerAdminDto.password, 12), createdAt: new Date() });
    await userRepository.save(admin);
    admin.emailVerified = true;
    admin.globalRole = GlobalRole.ADMIN;
    await userRepository.update(admin.id, admin);

    // Create regular users
    const christopherAndersonRegisterRegularUserDto: RegisterUserDto = getChristopherAndersonRegisterUserDto();
    const christopherAnderson: User = userRepository.create({ ...christopherAndersonRegisterRegularUserDto, password: await hash(christopherAndersonRegisterRegularUserDto.password, 12), createdAt: new Date() });
    await userRepository.save(christopherAnderson);
    christopherAnderson.emailVerified = true;
    await userRepository.update(christopherAnderson.id, christopherAnderson);

    const ronaldClarkRegisterRegularUserDto: RegisterUserDto = getRonaldClarkRegisterUserDto();
    const ronaldClark: User = userRepository.create({ ...ronaldClarkRegisterRegularUserDto, password: await hash(ronaldClarkRegisterRegularUserDto.password, 12), createdAt: new Date() });
    await userRepository.save(ronaldClark);
    ronaldClark.emailVerified = true;
    await userRepository.update(ronaldClark.id, ronaldClark);

    const maryWrightRegisterRegularUserDto: RegisterUserDto = getMaryWrightRegisterUserDto();
    const maryWright: User = userRepository.create({ ...maryWrightRegisterRegularUserDto, password: await hash(maryWrightRegisterRegularUserDto.password, 12), createdAt: new Date() });
    await userRepository.save(maryWright);
    maryWright.emailVerified = true;
    await userRepository.update(maryWright.id, maryWright);

    const lisaMitchellRegisterRegularUserDto: RegisterUserDto = getLisaMitchellRegisterUserDto();
    const lisaMitchell: User = userRepository.create({ ...lisaMitchellRegisterRegularUserDto, password: await hash(lisaMitchellRegisterRegularUserDto.password, 12), createdAt: new Date() });
    await userRepository.save(lisaMitchell);
    lisaMitchell.emailVerified = true;
    await userRepository.update(lisaMitchell.id, lisaMitchell);

    const michelleJohnsonRegisterRegularUserDto: RegisterUserDto = getMichelleJohnsonRegisterUserDto();
    const michelleJohnson: User = userRepository.create({ ...michelleJohnsonRegisterRegularUserDto, password: await hash(michelleJohnsonRegisterRegularUserDto.password, 12), createdAt: new Date() });
    await userRepository.save(michelleJohnson);
    michelleJohnson.emailVerified = true;
    await userRepository.update(michelleJohnson.id, michelleJohnson);

    const johnThomasRegisterRegularUserDto: RegisterUserDto = getJohnThomasRegisterUserDto();
    const johnThomas: User = userRepository.create({ ...johnThomasRegisterRegularUserDto, password: await hash(johnThomasRegisterRegularUserDto.password, 12), createdAt: new Date() });
    await userRepository.save(johnThomas);
    johnThomas.emailVerified = true;
    await userRepository.update(johnThomas.id, johnThomas);

    // Create user with unknown role
    const registerUnknownUserDto = getJamesSmithRegisterUserDto();
    registerUnknownUserDto.email = 'unknown@fakemail.com';
    const unknownUser = userRepository.create({ ...registerUnknownUserDto, password: await hash(registerUnknownUserDto.password, 12), createdAt: new Date() });
    await userRepository.save(unknownUser);
    unknownUser.emailVerified = true;
    unknownUser.globalRole = GlobalRole.UNKNOWN_ROLE;
    await userRepository.update(unknownUser.id, unknownUser);

    const userCount: number = await userRepository.count();
    expect(userCount).toBe(8);

    // Save login information

    logInAdminDto = {
      email: registerAdminDto.email,
      password: registerAdminDto.password,
    }

    christopherAndersonLogInUserDto = {
      email: christopherAndersonRegisterRegularUserDto.email,
      password: christopherAndersonRegisterRegularUserDto.password,
    }

    ronaldClarkLogInUserDto = {
      email: ronaldClarkRegisterRegularUserDto.email,
      password: ronaldClarkRegisterRegularUserDto.password,
    }

    maryWrightLogInUserDto = {
      email: maryWrightRegisterRegularUserDto.email,
      password: maryWrightRegisterRegularUserDto.password,
    }

    lisaMitchellLogInUserDto = {
      email: lisaMitchellRegisterRegularUserDto.email,
      password: lisaMitchellRegisterRegularUserDto.password,
    }

    michelleJohnsonLogInUserDto = {
      email: michelleJohnsonRegisterRegularUserDto.email,
      password: michelleJohnsonRegisterRegularUserDto.password,
    }

    johnThomasLogInUserDto = {
      email: johnThomasRegisterRegularUserDto.email,
      password: johnThomasRegisterRegularUserDto.password,
    }

    logInUnknownDto = {
      email: registerUnknownUserDto.email,
      password: registerUnknownUserDto.password,
    }



    // Create projects

    const createProjectDto1: CreateProjectDto = {
      name: project1.name,
      description: project1.description,
    };

    const createProjectDto2: CreateProjectDto = {
      name: project2.name,
      description: project2.description,
    };

    const createProjectDto3: CreateProjectDto = {
      name: project3.name,
      description: project3.description,
    };

    const createProjectDto4: CreateProjectDto = {
      name: project4.name,
      description: project4.description,
    };



    const christopherAndersonLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send(christopherAndersonLogInUserDto)
      .expect(HttpStatus.CREATED);

    const cookie1 = christopherAndersonLoginResponse.headers['set-cookie'];

    const createProject1Response = await request(app.getHttpServer())
      .post('/project')
      .send(createProjectDto1)
      .set('Cookie', cookie1);

    project1Id = createProject1Response.body.data.id;

    const createProject2Response = await request(app.getHttpServer())
      .post('/project')
      .send(createProjectDto2)
      .set('Cookie', cookie1);

    project2Id = createProject2Response.body.data.id;


    const ronaldClarkLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send(ronaldClarkLogInUserDto)
      .expect(HttpStatus.CREATED);

    const cookie2 = ronaldClarkLoginResponse.headers['set-cookie'];

    const createProject3Response = await request(app.getHttpServer())
      .post('/project')
      .send(createProjectDto3)
      .set('Cookie', cookie2);

    project3Id = createProject3Response.body.data.id;

    const createProject4Response = await request(app.getHttpServer())
      .post('/project')
      .send(createProjectDto4)
      .set('Cookie', cookie2);

    project4Id = createProject4Response.body.data.id;



    const projectCount: number = await projectRepository.count();
    expect(projectCount).toBe(4);

    createdProject3 = await projectRepository.findOne({
      where: { id: project3Id },
      relations: ['userProjectRoles', 'userProjectRoles.user']
    });

    expect(createdProject3).not.toBeNull();



    const maryWrightAssignUserDto: AssignUserDto = {
      user: maryWright,
      project: createdProject3,
      projectRole: ProjectRole.ADMIN,
      createdAt: new Date(),
    }

    const maryWrightUserProjectRole: UserProjectRole = userProjectRoleRepository.create(maryWrightAssignUserDto);
    await userProjectRoleRepository.save(maryWrightUserProjectRole);



    const lisaMitchellAssignUserDto: AssignUserDto = {
      user: lisaMitchell,
      project: createdProject3,
      projectRole: ProjectRole.EDITOR,
      createdAt: new Date(),
    }

    const lisaMitchellUserProjectRole: UserProjectRole = userProjectRoleRepository.create(lisaMitchellAssignUserDto);
    await userProjectRoleRepository.save(lisaMitchellUserProjectRole);



    const michelleJohnsonAssignUserDto: AssignUserDto = {
      user: michelleJohnson,
      project: createdProject3,
      projectRole: ProjectRole.VIEWER,
      createdAt: new Date(),
    }

    const michelleJohnsonUserProjectRole: UserProjectRole = userProjectRoleRepository.create(michelleJohnsonAssignUserDto);
    await userProjectRoleRepository.save(michelleJohnsonUserProjectRole);

    createdProject3 = await projectRepository.findOne({
      where: { id: project3Id },
      relations: ['userProjectRoles', 'userProjectRoles.user']
    });

    publicProjectDto = new PublicProjectDto(createdProject3);
  }, 20000);

  afterEach(async () => {
    await request(app.getHttpServer())
      .get('/auth/logout');
    await userRepository.clear();
    await projectRepository.clear();
    await userProjectRoleRepository.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('projects query', () => {

    it('should return 401 Unauthorized for unauthenticated user trying to access protected query', async () => {
      const query = `
        query {
          projects {
            id
            name
            description
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query });

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.UNAUTHORIZED);
      expect(response.body.data).toBeNull();
    });

    it('should return 403 Forbidden for authenticated user with unknown role', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(logInUnknownDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query {
          projects {
            id
            name
            description
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .set('Cookie', cookie);

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.FORBIDDEN.INCORRECT_ROLE);
      expect(response.body.data).toBeNull();
    });

    it('should return 403 Forbidden for authenticated regular user', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(christopherAndersonLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query {
          projects {
            id
            name
            description
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .set('Cookie', cookie);

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.FORBIDDEN.INCORRECT_ROLE);
      expect(response.body.data).toBeNull();
    });

    it('should return all projects for admin', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(logInAdminDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query {
          projects {
            id
            name
            description
            createdAt
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .set('Cookie', cookie);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).not.toBeDefined();
      expect(response.body.data.projects.length).toBe(4);
      expect(response.body.data.projects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: project1.name,
            description: project1.description,
            createdAt: expect.any(String),
          }),
          expect.objectContaining({
            id: expect.any(String),
            name: project2.name,
            description: project2.description,
            createdAt: expect.any(String),
          }),
          expect.objectContaining({
            id: expect.any(String),
            name: project3.name,
            description: project3.description,
            createdAt: expect.any(String),
          }),
          expect.objectContaining({
            id: expect.any(String),
            name: project4.name,
            description: project4.description,
            createdAt: expect.any(String),
          }),
        ])
      );
    });

  });

  describe('userProjects query', () => {

    it('should return 401 Unauthorized for unauthenticated user trying to access protected query', async () => {
      const query = `
        query {
          userProjects {
            id
            name
            description
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query });

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.UNAUTHORIZED);
      expect(response.body.data).toBeNull();
    });

    it('should return only user\'s projects for regular users', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(christopherAndersonLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query {
          userProjects {
            id
            name
            description
            createdAt
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query })
        .set('Cookie', cookie);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).not.toBeDefined();
      expect(response.body.data.userProjects.length).toBe(2);
      expect(response.body.data.userProjects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: project1.name,
            description: project1.description,
            createdAt: expect.any(String),
          }),
          expect.objectContaining({
            id: expect.any(String),
            name: project2.name,
            description: project2.description,
            createdAt: expect.any(String),
          }),
        ])
      );
    });

  });

  describe('project query', () => {

    it('should return 401 Unauthorized for unauthenticated user trying to access protected query', async () => {
      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
          }
        }
      `;
      const variables = { id: project3Id };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables });

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.UNAUTHORIZED);
      expect(response.body.data).toBeNull();
    });

    it('should return 403 Forbidden for authenticated user trying to access a project he is not part of', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(johnThomasLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
          }
        }
      `;
      const variables = { id: project3Id };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables })
        .set('Cookie', cookie);

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.FORBIDDEN.PROJECT_NOT_FOUND_OR_LACKING_PERMISSIONS);
      expect(response.body.data).toBeNull();
    });

    it('should return project for PROJECT OWNER', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(ronaldClarkLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
            createdAt
            owner {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
            members {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
          }
        }
      `;
      const variables = { id: project3Id };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables })
        .set('Cookie', cookie);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).not.toBeDefined();

      expect(response.body.data).toEqual({
        project: {
          id: publicProjectDto.id,
          name: publicProjectDto.name,
          description: publicProjectDto.description,
          createdAt: expect.any(String),
          owner: expect.objectContaining({
            id: publicProjectDto.owner.id,
            firstname: publicProjectDto.owner.firstname,
            lastname: publicProjectDto.owner.lastname,
            email: publicProjectDto.owner.email,
            projectRole: ProjectRole.OWNER,
            createdAt: expect.any(String),
          }),
          members: expect.arrayContaining([
            {
              id: publicProjectDto.members[0].id,
              firstname: publicProjectDto.members[0].firstname,
              lastname: publicProjectDto.members[0].lastname,
              email: publicProjectDto.members[0].email,
              projectRole: ProjectRole.ADMIN,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[1].id,
              firstname: publicProjectDto.members[1].firstname,
              lastname: publicProjectDto.members[1].lastname,
              email: publicProjectDto.members[1].email,
              projectRole: ProjectRole.EDITOR,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[2].id,
              firstname: publicProjectDto.members[2].firstname,
              lastname: publicProjectDto.members[2].lastname,
              email: publicProjectDto.members[2].email,
              projectRole: ProjectRole.VIEWER,
              createdAt: expect.any(String),
            },
          ]),
        },
      });
    });

    it('should return project for PROJECT ADMIN', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(maryWrightLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
            createdAt
            owner {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
            members {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
          }
        }
      `;
      const variables = { id: project3Id };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables })
        .set('Cookie', cookie);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).not.toBeDefined();

      expect(response.body.data).toEqual({
        project: {
          id: publicProjectDto.id,
          name: publicProjectDto.name,
          description: publicProjectDto.description,
          createdAt: expect.any(String),
          owner: expect.objectContaining({
            id: publicProjectDto.owner.id,
            firstname: publicProjectDto.owner.firstname,
            lastname: publicProjectDto.owner.lastname,
            email: publicProjectDto.owner.email,
            projectRole: ProjectRole.OWNER,
            createdAt: expect.any(String),
          }),
          members: expect.arrayContaining([
            {
              id: publicProjectDto.members[0].id,
              firstname: publicProjectDto.members[0].firstname,
              lastname: publicProjectDto.members[0].lastname,
              email: publicProjectDto.members[0].email,
              projectRole: ProjectRole.ADMIN,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[1].id,
              firstname: publicProjectDto.members[1].firstname,
              lastname: publicProjectDto.members[1].lastname,
              email: publicProjectDto.members[1].email,
              projectRole: ProjectRole.EDITOR,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[2].id,
              firstname: publicProjectDto.members[2].firstname,
              lastname: publicProjectDto.members[2].lastname,
              email: publicProjectDto.members[2].email,
              projectRole: ProjectRole.VIEWER,
              createdAt: expect.any(String),
            },
          ]),
        },
      });
    });

    it('should return project for PROJECT EDITOR', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(lisaMitchellLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
            createdAt
            owner {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
            members {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
          }
        }
      `;
      const variables = { id: project3Id };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables })
        .set('Cookie', cookie);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).not.toBeDefined();

      expect(response.body.data).toEqual({
        project: {
          id: publicProjectDto.id,
          name: publicProjectDto.name,
          description: publicProjectDto.description,
          createdAt: expect.any(String),
          owner: expect.objectContaining({
            id: publicProjectDto.owner.id,
            firstname: publicProjectDto.owner.firstname,
            lastname: publicProjectDto.owner.lastname,
            email: publicProjectDto.owner.email,
            projectRole: ProjectRole.OWNER,
            createdAt: expect.any(String),
          }),
          members: expect.arrayContaining([
            {
              id: publicProjectDto.members[0].id,
              firstname: publicProjectDto.members[0].firstname,
              lastname: publicProjectDto.members[0].lastname,
              email: publicProjectDto.members[0].email,
              projectRole: ProjectRole.ADMIN,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[1].id,
              firstname: publicProjectDto.members[1].firstname,
              lastname: publicProjectDto.members[1].lastname,
              email: publicProjectDto.members[1].email,
              projectRole: ProjectRole.EDITOR,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[2].id,
              firstname: publicProjectDto.members[2].firstname,
              lastname: publicProjectDto.members[2].lastname,
              email: publicProjectDto.members[2].email,
              projectRole: ProjectRole.VIEWER,
              createdAt: expect.any(String),
            },
          ]),
        },
      });
    });

    it('should return project for PROJECT VIEWER', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(michelleJohnsonLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
            createdAt
            owner {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
            members {
              id
              firstname
              lastname
              email
              projectRole
              createdAt
            }
          }
        }
      `;
      const variables = { id: project3Id };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables })
        .set('Cookie', cookie);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).not.toBeDefined();

      expect(response.body.data).toEqual({
        project: {
          id: publicProjectDto.id,
          name: publicProjectDto.name,
          description: publicProjectDto.description,
          createdAt: expect.any(String),
          owner: expect.objectContaining({
            id: publicProjectDto.owner.id,
            firstname: publicProjectDto.owner.firstname,
            lastname: publicProjectDto.owner.lastname,
            email: publicProjectDto.owner.email,
            projectRole: ProjectRole.OWNER,
            createdAt: expect.any(String),
          }),
          members: expect.arrayContaining([
            {
              id: publicProjectDto.members[0].id,
              firstname: publicProjectDto.members[0].firstname,
              lastname: publicProjectDto.members[0].lastname,
              email: publicProjectDto.members[0].email,
              projectRole: ProjectRole.ADMIN,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[1].id,
              firstname: publicProjectDto.members[1].firstname,
              lastname: publicProjectDto.members[1].lastname,
              email: publicProjectDto.members[1].email,
              projectRole: ProjectRole.EDITOR,
              createdAt: expect.any(String),
            },
            {
              id: publicProjectDto.members[2].id,
              firstname: publicProjectDto.members[2].firstname,
              lastname: publicProjectDto.members[2].lastname,
              email: publicProjectDto.members[2].email,
              projectRole: ProjectRole.VIEWER,
              createdAt: expect.any(String),
            },
          ]),
        },
      });
    });

  });

  describe('createProject mutation', () => {

    it('should return 401 Unauthorized for unauthenticated user trying to create a project', async () => {
      const mutation = `
        mutation createProject($input: CreateProjectDto!) {
          createProject(input: $input) {
            name
            description
          }
        }
      `;

      const variables = {
        input: {
          name: 'GraphQL',
          description: 'GraphQL test.',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables });

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe(RETURN_MESSAGES.UNAUTHORIZED);
      expect(response.body.data).toBeNull();
    });

    it('should return newly created project for authenticated user', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(christopherAndersonLogInUserDto)
        .expect(HttpStatus.CREATED);

      const cookie = loginResponse.headers['set-cookie'];

      const mutation = `
        mutation createProject($input: CreateProjectDto!) {
          createProject(input: $input) {
            id
            name
            description
          }
        }
      `;

      const variables = {
        input: {
          name: 'GraphQL',
          description: 'GraphQL test.',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Cookie', cookie);

      // GraphQL still returns 200 at the HTTP level
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.errors).not.toBeDefined();
      expect(response.body.data).toEqual({
        createProject: expect.objectContaining({
          id: expect.any(String),
          name: 'GraphQL',
          description: 'GraphQL test.',
        }),
      });

      const newProject = await projectRepository.findOne({
        where: { id: response.body.id },
      });

      expect(newProject).not.toBeNull();
    });

  });

});