export const LOG_CONTEXTS = {

    AuthService: {
      registerUser: 'AuthService.registerUser',
      verifyUser: 'AuthService.verifyUser',
      sendResetPasswordEmail: 'AuthService.sendResetPasswordEmail',
      sendForgotPasswordEmail: 'AuthService.sendForgotPasswordEmail',
      resetPassword: 'AuthService.resetPassword',
      findById: 'AuthService.findById',
      findByEmail: 'AuthService.findByEmail',
      deleteUser: 'AuthService.deleteUser',
    },

    UserService: {
        create: 'UserService.create',
        findAll: 'UserService.findAll',
        findOneById: 'UserService.findOneById',
        findOneByEmail: 'UserService.findOneByEmail',
        update: 'UserService.update',
        markUserAccountAsVerified: 'UserService.markUserAccountAsVerified',
        remove: 'UserService.remove',
    },

    ProjectService: {
        create: 'ProjectService.create',
        findAll: 'ProjectService.findAll',
        findAllByUserId: 'ProjectService.findAllByUserId',
        findOneById: 'ProjectService.findOneById',
        update: 'ProjectService.update',
        remove: 'ProjectService.remove',
    },

    UserController: {
        findOne: 'UserController.findOne',
        remove: 'UserController.remove',
    },

    IssueService: {
        create: 'IssueService.create',
        findAllByProjectId: 'IssueService.findAllByProjectId',
        findOneById: 'IssueService.findOneById',
        update: 'IssueService.update',
        remove: 'IssueService.remove',
    },

    LabelService: {
        create: 'LabelService.create',
        findAllByProjectId: 'LabelService.findAllByProjectId',
        findOneById: 'LabelService.findOneById',
        update: 'LabelService.update',
        remove: 'LabelService.remove',
    },

    CommentService: {
        create: 'CommentService.create',
        findAllByIssueId: 'CommentService.findAllByIssueId',
        update: 'CommentService.update',
        remove: 'CommentService.remove',
    },

    ValidationPipe: 'ValidationPipe',
    AllExceptionsFilter: 'AllExceptionsFilter',

  };