export const LOG_MESSAGES = {

    AUTH: {
        REGISTER_USER: {
            EMAIL_ALREADY_REGISTERED: 'Could not create account. Reason: email already registered.',
            PASSWORD_MISMATCH: 'Could not create account. Reason: passwords don\'t match',
            SUCCESS: (firstname: string, lastname: string, email: string) => `User '${firstname} ${lastname}' successfully registered with email '${email}'.`,
            CONFIRMATION_EMAIL: (email: string) => `Confirmation email successfully sent to '${email}'.`,
            FAILED_TO_SEND_EMAIL: (email: string, errorMessage: string) => `Failed to send confirmation email to '${email}'. Reason: '${errorMessage}'`,
        },
        VERIFY_USER: {
            INVALID_UUID: 'Could not verify user. The provided user id was not a valid UUID.',
            USER_NOT_FOUND: (userId: string) => `Could not verify user. User with id '${userId}' not found.`,
            BAD_TOKEN: (token: string) => `Could not verify user. Token '${token}' is expired or invalid.`,
            SUCCESS: (firstname: string, lastname: string, email: string) => `User '${firstname} ${lastname}' successfully confirmed their email ('${email}').`,
        },
        SEND_RESET_PASSWORD_EMAIL: {
            INVALID_UUID: 'Could not send password reset email. The provided user id was not a valid UUID.',
            USER_NOT_FOUND: (userId: string) => `Could not send password reset email. User with id '${userId}' not found.`,
            FAILED_TO_SEND_RESET_PASSWORD_EMAIL: (email: string, errorMessage: string) => `Failed to send password reset email to user '${email}'. Reason: '${errorMessage}'`,
            SUCCESS: (email: string) => `Password reset email sent to '${email}'.`,
        },
        SEND_FORGOT_PASSWORD_EMAIL: {
            USER_NOT_FOUND: (email: string) => `Attempt to send reset password confirmation to unregistered email: '${email}'.`,
            FAILED_TO_SEND_RESET_PASSWORD_EMAIL: (email: string, errorMessage: string) => `Failed to send password reset email to user ${email}. Reason: ${errorMessage}`,
            SUCCESS: (email: string) => `Password reset email sent to '${email}'.`,
        },
        RESET_PASSWORD: {
            INVALID_UUID: 'Could not reset user\'s password. The provided user id was not a valid UUID.',
            USER_NOT_FOUND: (userId: string) => `Could not reset user\'s password. User with id '${userId}' not found.`,
            BAD_TOKEN: 'Failed to reset user\'s password. Token was expired or invalid.',
            PASSWORD_MISMATCH: 'Failed to reset user\'s password. The new passwords don\'t match.',
            SUCCESS: 'Successfully reset user\'s password.',
        },
        FIND_BY_EMAIL: {
            USER_NOT_FOUND: (email: string) => `User with email '${email}' not found.`,
        },
        DELETE_USER: {
            INVALID_UUID: 'Could not delete user. The provided user id was not a valid UUID.',
            USER_NOT_FOUND: (userId: string) => `Could not delete user. User with id '${userId}' not found.`,
            SUCCESS: (email: string) => `User '${email}' successfully deleted.`,
        },
    },

    PROJECT: {
        CREATE: {
            INVALID_UUID: 'Could not create project. The provided user id was not a valid UUID.',
            USER_NOT_FOUND: (projectName: string, userId: string) => `Could not create project '${projectName}'. User with id '${userId}' not found.`,
            SUCCESS: (firstname: string, lastname: string, projectName: string) => `User '${firstname} ${lastname}' created project '${projectName}'.`,
        },
        FIND_ALL_BY_USER_ID: {
            INVALID_UUID: 'Could not retrieve user\'s projects. The provided user id was not a valid UUID.',
            USER_NOT_FOUND: (userId: string) => `Could not retrieve user's projects. User with id '${userId}' not found.`,
        },
        FIND_ONE_BY_ID: {
            INVALID_UUID: 'Could not retrieve project. The provided project id was not a valid UUID.',
            FAILED_TO_RETRIEVE_PROJECT_FROM_CACHE: (projectId: string) => `Failed to retrieve project '${projectId}' from cache.`,
            PROJECT_NOT_FOUND: (projectId: string) => `Could not retrieve project. Project with id '${projectId}' not found.`,
            FAILED_TO_CACHE_PROJECT: (projectId: string) => `Failed to cache project '${projectId}'.`,
        },
        UPDATE: {
            INVALID_UUID: 'Could not update project. The provided project id was not a valid UUID.',
            PROJECT_NOT_FOUND: (projectId: string) => `Could not update project. Project with id '${projectId}' not found.`,
            MISSING_PROPS: (projectName: string, missingProperties: string[]) => `Could not update project '${projectName}'. Reason: missing properties: ${missingProperties}.`,
            //SUCCESS: (firstname: string, lastname: string, projectName: string) => `User ${firstname} ${lastname} updated project '${projectName}'.`,
            SUCCESS: (projectName: string) => `Updated project '${projectName}'.`,
        },
        REMOVE: {
            INVALID_UUID: 'Could not delete project. The provided project id was not a valid UUID.',
            PROJECT_NOT_FOUND: (projectId: string) => `Could not delete project. Project with id '${projectId}' not found.`,
            //SUCCESS: (firstname: string, lastname: string, projectName: string) => `User ${firstname} ${lastname} deleted project '${projectName}'.`,
            SUCCESS: (projectName: string) => `Deleted project: '${projectName}'`,
        },
    },

    USER: {
        INVALID_UUID: 'Could not find user. The provided user id was not a valid UUID.',
    },

    ISSUE: {
        CREATE: {
            FORBIDDEN: (userId: string, projectId: string) => `User '${userId}' attempted to create an issue on project '${projectId}' without sufficient permissions.`,
            INVALID_ASSIGNEE_ID: 'Could not create issue. The provided assignee id was not a valid UUID.',
            ASSIGNEE_NOT_FOUND: (assigneeId: string) => `Could not create issue. Assignee with id '${assigneeId}' not found, or not a member of the project.`,
            SUCCESS: (title: string, projectName: string) => `Created issue '${title}' on project '${projectName}'.`,
        },
        FIND_ALL: {
            FORBIDDEN: (userId: string, projectId: string) => `User '${userId}' attempted to list issues on project '${projectId}' without being a member.`,
        },
        FIND_ONE_BY_ID: {
            INVALID_UUID: 'Could not retrieve issue. The provided issue id was not a valid UUID.',
            ISSUE_NOT_FOUND: (issueId: string) => `Could not retrieve issue. Issue with id '${issueId}' not found.`,
            FORBIDDEN: (userId: string, issueId: string) => `User '${userId}' attempted to retrieve issue '${issueId}' without being a member of its project.`,
        },
        UPDATE: {
            INVALID_UUID: 'Could not update issue. The provided issue id was not a valid UUID.',
            ISSUE_NOT_FOUND: (issueId: string) => `Could not update issue. Issue with id '${issueId}' not found.`,
            FORBIDDEN: (userId: string, issueId: string) => `User '${userId}' attempted to update issue '${issueId}' without sufficient permissions.`,
            INVALID_ASSIGNEE_ID: 'Could not update issue. The provided assignee id was not a valid UUID.',
            ASSIGNEE_NOT_FOUND: (assigneeId: string) => `Could not update issue. Assignee with id '${assigneeId}' not found, or not a member of the project.`,
            SUCCESS: (title: string) => `Updated issue '${title}'.`,
        },
        REMOVE: {
            INVALID_UUID: 'Could not delete issue. The provided issue id was not a valid UUID.',
            ISSUE_NOT_FOUND: (issueId: string) => `Could not delete issue. Issue with id '${issueId}' not found.`,
            FORBIDDEN: (userId: string, issueId: string) => `User '${userId}' attempted to delete issue '${issueId}' without sufficient permissions.`,
            SUCCESS: (title: string) => `Deleted issue '${title}'.`,
        },
    },

    LABEL: {
        CREATE: {
            FORBIDDEN: (userId: string, projectId: string) => `User '${userId}' attempted to create a label on project '${projectId}' without sufficient permissions.`,
            SUCCESS: (name: string, projectName: string) => `Created label '${name}' on project '${projectName}'.`,
        },
        FIND_ALL: {
            FORBIDDEN: (userId: string, projectId: string) => `User '${userId}' attempted to list labels on project '${projectId}' without being a member.`,
        },
        FIND_ONE_BY_ID: {
            INVALID_UUID: 'Could not retrieve label. The provided label id was not a valid UUID.',
            LABEL_NOT_FOUND: (labelId: string) => `Could not retrieve label. Label with id '${labelId}' not found.`,
            FORBIDDEN: (userId: string, labelId: string) => `User '${userId}' attempted to retrieve label '${labelId}' without being a member of its project.`,
        },
        UPDATE: {
            INVALID_UUID: 'Could not update label. The provided label id was not a valid UUID.',
            LABEL_NOT_FOUND: (labelId: string) => `Could not update label. Label with id '${labelId}' not found.`,
            FORBIDDEN: (userId: string, labelId: string) => `User '${userId}' attempted to update label '${labelId}' without sufficient permissions.`,
            SUCCESS: (name: string) => `Updated label '${name}'.`,
        },
        REMOVE: {
            INVALID_UUID: 'Could not delete label. The provided label id was not a valid UUID.',
            LABEL_NOT_FOUND: (labelId: string) => `Could not delete label. Label with id '${labelId}' not found.`,
            FORBIDDEN: (userId: string, labelId: string) => `User '${userId}' attempted to delete label '${labelId}' without sufficient permissions.`,
            SUCCESS: (name: string) => `Deleted label '${name}'.`,
        },
    },

    COMMENT: {
        CREATE: {
            FORBIDDEN: (userId: string, issueId: string) => `User '${userId}' attempted to comment on issue '${issueId}' without being a member of its project.`,
            SUCCESS: (issueId: string) => `Created comment on issue '${issueId}'.`,
        },
        FIND_ALL: {
            FORBIDDEN: (userId: string, issueId: string) => `User '${userId}' attempted to list comments on issue '${issueId}' without being a member of its project.`,
        },
        UPDATE: {
            INVALID_UUID: 'Could not update comment. The provided comment id was not a valid UUID.',
            COMMENT_NOT_FOUND: (commentId: string) => `Could not update comment. Comment with id '${commentId}' not found.`,
            FORBIDDEN: (userId: string, commentId: string) => `User '${userId}' attempted to update comment '${commentId}' without sufficient permissions.`,
            SUCCESS: (commentId: string) => `Updated comment '${commentId}'.`,
        },
        REMOVE: {
            INVALID_UUID: 'Could not delete comment. The provided comment id was not a valid UUID.',
            COMMENT_NOT_FOUND: (commentId: string) => `Could not delete comment. Comment with id '${commentId}' not found.`,
            FORBIDDEN: (userId: string, commentId: string) => `User '${userId}' attempted to delete comment '${commentId}' without sufficient permissions.`,
            SUCCESS: (commentId: string) => `Deleted comment '${commentId}'.`,
        },
    },

    VALIDATION: {
        FAILED: (dto: string, properties: string[]) => `Request body failed ${dto} validation. Invalid properties: ${properties}.`,
    },

    EXCEPTION_FILTER: {
        UNHANDLED: (operation: string, errorMessage: string) => `Unhandled error during ${operation}: ${errorMessage}`,
    },

};
