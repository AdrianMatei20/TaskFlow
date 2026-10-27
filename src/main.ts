import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import * as passport from 'passport';
import * as dotenv from 'dotenv';
import { isSqlQueryCounterEnabled, sqlQueryCounterMiddleware } from './shared/query-counter/sql-query-counter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  dotenv.config();

  const NUMBER_OF_HOURS: number = 3;

  // Performance measurement only: counts SQL queries per request (registered first, so session queries count too)
  if (isSqlQueryCounterEnabled()) {
    app.use(sqlQueryCounterMiddleware);
  }

  // Initialize sessions
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

  // Initialize passport
  const passport = require('passport');
  const LocalStrategy = require('passport-local').Strategy;
  app.use(passport.initialize());
  app.use(passport.session());

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('TaskFlow API')
    .setDescription('REST API for TaskFlow, a Jira-like project tracker built with NestJS.')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  const host = process.env.HOST;

  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
}
bootstrap();
