import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { HealthModule } from './health/health.module';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from './auth/auth.module';
import { ProjectModule } from './resources/project/project.module';
import { UserModule } from './resources/user/user.module';
import { IssueModule } from './resources/issue/issue.module';
import { LabelModule } from './resources/label/label.module';
import { CommentModule } from './resources/comment/comment.module';
import { LoggerModule } from './logger/logger.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MonitoringModule } from './metrics/monitoring.module';

import { User } from './resources/user/entities/user.entity';
import { Project } from './resources/project/entities/project.entity';
import { UserProjectRole } from './resources/project/entities/user-project-role.entity';
import { Issue } from './resources/issue/entities/issue.entity';
import { Label } from './resources/label/entities/label.entity';
import { Comment } from './resources/comment/entities/comment.entity';
import { Log } from './logger/entities/log.entity';
import { ResetPassword } from './auth/reset-password/reset-password.entity';

import { EmailService } from './services/email/email.service';
import { TokenService } from './services/token/token.service';
import { JwtService } from '@nestjs/jwt';
import { SeedService } from './services/seed/seed.service';
import { LoggerService } from './logger/logger.service';
import { AuthService } from './auth/auth.service';
import { ResetPasswordService } from './auth/reset-password/reset-password.service';

import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { HelloResolver } from './graphql/hello/hello.resolver';
import { ProjectResolver } from './graphql/project/project.resolver';
import { IssueResolver } from './graphql/issue/issue.resolver';
import { LabelResolver } from './graphql/label/label.resolver';
import { CommentResolver } from './graphql/comment/comment.resolver';
import { join } from 'path';
import { CacheModule } from './cache/cache.module';
import { validationPipeProvider } from './shared/validation/validation-pipe.provider';
import { allExceptionsFilterProvider } from './shared/exceptions/all-exceptions.filter';
import { QueryCountingLogger } from './shared/query-counter/sql-query-counter';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      isGlobal: true,
    }),
    PassportModule.register({
      session: true,
    }),
    HealthModule,
    AuthModule,
    ProjectModule,
    UserModule,
    IssueModule,
    LabelModule,
    CommentModule,
    LoggerModule,
    TypeOrmModule.forRoot({
      type: process.env.DB_TYPE as any,
      host: process.env.PG_HOST,
      port: parseInt(process.env.PG_PORT),
      username: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: process.env.PG_DB,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
      logger: new QueryCountingLogger(), // counts queries per request when SQL_QUERY_COUNTER=true
    }),
    TypeOrmModule.forFeature([User, Project, UserProjectRole, Issue, Label, Comment, Log, ResetPassword]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'), // auto-generate
      sortSchema: true,
      playground: true, // enable GraphQL playground
      introspection: true, // explicitly allow introspection
      context: ({ req }) => ({ req }), // attaches user to context
    }),
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
    MonitoringModule,
    CacheModule,
  ],
  controllers: [AppController],
  providers: [
    validationPipeProvider,
    allExceptionsFilterProvider,
    AppService,
    EmailService,
    TokenService,
    JwtService,
    SeedService,
    LoggerService,
    AuthService,
    ResetPasswordService,
    HelloResolver,
    ProjectResolver,
    IssueResolver,
    LabelResolver,
    CommentResolver,
  ],
})
export class AppModule {

  constructor(private readonly seedService: SeedService) { }

  async onModuleInit() {
    await this.seedService.seed();
  }

}
