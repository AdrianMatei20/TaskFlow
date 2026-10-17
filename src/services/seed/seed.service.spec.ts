import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { SeedService } from './seed.service';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/resources/user/entities/user.entity';
import { Project } from 'src/resources/project/entities/project.entity';
import { UserProjectRole } from 'src/resources/project/entities/user-project-role.entity';
import { Issue } from 'src/resources/issue/entities/issue.entity';
import { Label } from 'src/resources/label/entities/label.entity';
import { Comment } from 'src/resources/comment/entities/comment.entity';
import { Log } from 'src/logger/entities/log.entity';
import { ProjectService } from 'src/resources/project/project.service';
import { LoggerService } from 'src/logger/logger.service';
import { UserService } from 'src/resources/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { IssueService } from 'src/resources/issue/issue.service';
import { LabelService } from 'src/resources/label/label.service';
import { CommentService } from 'src/resources/comment/comment.service';
import { EmailService } from '../email/email.service';
import { TokenService } from '../token/token.service';
import { ResetPasswordService } from 'src/auth/reset-password/reset-password.service';
import { JwtService } from '@nestjs/jwt';
import { ResetPassword } from 'src/auth/reset-password/reset-password.entity';
import { userJamesSmith } from 'test/data/users';
import { toBeBoolean, toBeTrue } from 'jest-extended';
import { CacheService } from 'src/cache/cache.service';

describe('SeedService', () => {
  let seedService: SeedService;
  let userRepository: Repository<User>;
  let projectRepository: Repository<Project>;
  let userProjectRoleRepository: Repository<UserProjectRole>;
  let issueRepository: Repository<Issue>;
  let labelRepository: Repository<Label>;
  let commentRepository: Repository<Comment>;
  let loggerRepository: Repository<Log>;
  let mockEmailService: any;
  let mockCacheService: any;

  beforeEach(async () => {
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const { toBeBoolean, toBeTrue, toBeFalse } = require('jest-extended');
    expect.extend({ toBeBoolean, toBeTrue, toBeFalse });

    if (!expect.getState().currentTestName?.includes('skip')) {
      process.env.SECRET = 'mocked-secret';
      process.env.ADMIN_USER_EMAIL = 'ADMIN_USER_EMAIL';
      process.env.DEFAULT_USER_EMAIL = 'DEFAULT_USER_EMAIL';
      process.env.DEFAULT_USER_FIRSTNAME = 'DEFAULT_USER_FIRSTNAME';
      process.env.DEFAULT_USER_LASTNAME = 'DEFAULT_USER_LASTNAME';
      process.env.DEFAULT_PASSWORD = 'DEFAULT_PASSWORD';
    } else {
      delete process.env.SECRET;
      delete process.env.ADMIN_USER_EMAIL;
      delete process.env.DEFAULT_USER_EMAIL;
      delete process.env.DEFAULT_USER_FIRSTNAME;
      delete process.env.DEFAULT_USER_LASTNAME;
      delete process.env.DEFAULT_PASSWORD;
    }

    mockEmailService = {
      sendRegistrationEmail: jest.fn().mockResolvedValue(true),
      sendResetPasswordEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [User, UserProjectRole, Project, Issue, Label, Comment, Log, ResetPassword],
          synchronize: true,
          dropSchema: true,
        }),
        TypeOrmModule.forFeature([User, UserProjectRole, Project, Issue, Label, Comment, Log, ResetPassword]),
      ],
      providers: [
        SeedService,
        ProjectService,
        UserService,
        AuthService,
        IssueService,
        LabelService,
        CommentService,
        LoggerService,
        { provide: EmailService, useValue: mockEmailService },
        TokenService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mocked-jwt-token'),
            verify: jest.fn().mockImplementation((token) => {
              if (token === 'valid-token') return { id: userJamesSmith.id, email: userJamesSmith.email };
              throw new Error('Invalid token');
            }),
          },
        },
        ResetPasswordService,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    seedService = module.get<SeedService>(SeedService);

    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    projectRepository = module.get<Repository<Project>>(getRepositoryToken(Project));
    userProjectRoleRepository = module.get<Repository<UserProjectRole>>(getRepositoryToken(UserProjectRole));
    issueRepository = module.get<Repository<Issue>>(getRepositoryToken(Issue));
    labelRepository = module.get<Repository<Label>>(getRepositoryToken(Label));
    commentRepository = module.get<Repository<Comment>>(getRepositoryToken(Comment));
    loggerRepository = module.get<Repository<Log>>(getRepositoryToken(Log));
  });

  afterEach(async () => {
    await commentRepository.clear();
    await issueRepository.clear();
    await labelRepository.clear();
    await userProjectRoleRepository.clear();
    await userRepository.clear();
    await projectRepository.clear();
    await loggerRepository.clear();
  });

  it('should be defined', () => {
    expect(seedService).toBeDefined();
  });

  describe('seed', () => {
    it('should seed database', async () => {
      await seedService.seed();

      const adminExists: boolean = await userRepository.exists({
        where: { email: 'admin_user_email' }
      });
      expect(adminExists).toBeTrue();

      const myUserExists: boolean = await userRepository.exists({
        where: { email: 'default_user_email' }
      });
      expect(myUserExists).toBeTrue();

      const userCount: number = await userRepository.count();
      expect(userCount).toBe(52);

      const projectsCount: number = await projectRepository.count();
      expect(projectsCount).toBe(50);

      const userProjectRolesCount: number = await userProjectRoleRepository.count();
      expect(userProjectRolesCount).toBeGreaterThanOrEqual(100);

      const labelsCount: number = await labelRepository.count();
      expect(labelsCount).toBe(200); // 50 projects x 4 labels

      const issuesCount: number = await issueRepository.count();
      expect(issuesCount).toBe(250); // 50 projects x 5 issues

      const commentsCount: number = await commentRepository.count();
      expect(commentsCount).toBe(100); // 50 projects x 2 commented issues

      const logsCount: number = await loggerRepository.count();
      expect(logsCount).toBeGreaterThanOrEqual(100);

      const infoLogsCount: number = await loggerRepository.count({ where: { level: 'INFO' } });
      expect(infoLogsCount).toBeGreaterThan(0);

      const warnLogsCount: number = await loggerRepository.count({ where: { level: 'WARN' } });
      expect(warnLogsCount).toBeGreaterThanOrEqual(6);

    }, 150000);

    it('should skip seeding if environment variables not set', async () => {
      await seedService.seed();

      const adminExists: boolean = await userRepository.exists({
        where: { email: 'admin_user_email' }
      });
      expect(adminExists).toBeFalse();

      const myUserExists: boolean = await userRepository.exists({
        where: { email: 'default_user_email' }
      });
      expect(myUserExists).toBeFalse();

      const userCount: number = await userRepository.count();
      expect(userCount).toBe(0);

      const projectsCount: number = await projectRepository.count();
      expect(projectsCount).toBe(0);

      const userProjectRolesCount: number = await userProjectRoleRepository.count();
      expect(userProjectRolesCount).toBe(0);

      const labelsCount: number = await labelRepository.count();
      expect(labelsCount).toBe(0);

      const issuesCount: number = await issueRepository.count();
      expect(issuesCount).toBe(0);

      const commentsCount: number = await commentRepository.count();
      expect(commentsCount).toBe(0);

      const logsCount: number = await loggerRepository.count();
      expect(logsCount).toBe(0);
    });

    it('should not seed the database multiple times', async () => {
      await seedService.seed();
      await seedService.seed();

      const adminExists: boolean = await userRepository.exists({
        where: { email: 'admin_user_email' }
      });
      expect(adminExists).toBeTrue();

      const myUserExists: boolean = await userRepository.exists({
        where: { email: 'default_user_email' }
      });
      expect(myUserExists).toBeTrue();

      const userCount: number = await userRepository.count();
      expect(userCount).toBe(52);

      const projectsCount: number = await projectRepository.count();
      expect(projectsCount).toBe(50);

      const userProjectRolesCount: number = await userProjectRoleRepository.count();
      expect(userProjectRolesCount).toBeGreaterThanOrEqual(100);

      const labelsCount: number = await labelRepository.count();
      expect(labelsCount).toBe(200); // unchanged by the second seed() call

      const issuesCount: number = await issueRepository.count();
      expect(issuesCount).toBe(250); // unchanged by the second seed() call

      const commentsCount: number = await commentRepository.count();
      expect(commentsCount).toBe(100); // unchanged by the second seed() call

      const logsCount: number = await loggerRepository.count();
      expect(logsCount).toBeGreaterThanOrEqual(100);

      const warnLogsCount: number = await loggerRepository.count({ where: { level: 'WARN' } });
      expect(warnLogsCount).toBe(6);

    }, 150000);
  });

});
