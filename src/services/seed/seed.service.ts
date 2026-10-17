import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from 'src/resources/project/entities/project.entity';
import { UserProjectRole } from 'src/resources/project/entities/user-project-role.entity';
import { User } from 'src/resources/user/entities/user.entity';
import { GlobalRole } from 'src/resources/user/enums/global-role';
import { ProjectRole } from 'src/resources/project/enums/project-role';
import { Label } from 'src/resources/label/entities/label.entity';
import { IssueType } from 'src/resources/issue/enums/issue-type';
import { IssueStatus } from 'src/resources/issue/enums/issue-status';
import { IssuePriority } from 'src/resources/issue/enums/issue-priority';
import { ProjectService } from 'src/resources/project/project.service';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from 'src/resources/user/user.service';
import { IssueService } from 'src/resources/issue/issue.service';
import { LabelService } from 'src/resources/label/label.service';
import { CommentService } from 'src/resources/comment/comment.service';
import { LoggerService } from 'src/logger/logger.service';
import { createValidationPipe } from 'src/shared/validation/validation-pipe.provider';
import { RegisterUserDto } from 'src/resources/user/dto/register-user.dto';
import { CreateProjectDto } from 'src/resources/project/dto/create-project.dto';
import { UpdateProjectDto } from 'src/resources/project/dto/update-project.dto';
import { AssignUserDto } from 'src/resources/project/dto/assign-user.dto';
import users from './test-data/users.json';
import projects from './test-data/projects.json';
import projectUpdates from './test-data/project-changes.json';

// Fixed templates cycled deterministically per project/issue index, so the same projects
// always end up with the same labels, issues, statuses and comments on every seed run.
const LABEL_TEMPLATES: { name: string; color: string }[] = [
    { name: 'bug', color: '#ef4444' },
    { name: 'frontend', color: '#3b82f6' },
    { name: 'backend', color: '#8b5cf6' },
    { name: 'urgent', color: '#f97316' },
];

const ISSUE_TEMPLATES: { title: string; description: string; type: IssueType; priority: IssuePriority }[] = [
    { title: 'Set up project repository and CI pipeline', description: 'Initialize the repository, configure linting, and wire up a basic CI pipeline.', type: IssueType.TASK, priority: IssuePriority.MEDIUM },
    { title: 'Design initial database schema', description: 'Model the core entities and their relationships before implementation starts.', type: IssueType.TASK, priority: IssuePriority.HIGH },
    { title: 'Fix layout issue on small viewports', description: 'The main layout breaks below 400px width on several screens.', type: IssueType.BUG, priority: IssuePriority.HIGH },
    { title: 'Write onboarding documentation', description: 'Document setup steps for new contributors.', type: IssueType.STORY, priority: IssuePriority.LOW },
    { title: 'Investigate intermittent timeout errors', description: 'Some requests occasionally time out under load; needs investigation.', type: IssueType.BUG, priority: IssuePriority.CRITICAL },
    { title: 'Plan next quarter roadmap', description: 'Outline the major themes and milestones for the next quarter.', type: IssueType.EPIC, priority: IssuePriority.MEDIUM },
];

const ISSUE_STATUSES: IssueStatus[] = [IssueStatus.TODO, IssueStatus.IN_PROGRESS, IssueStatus.IN_REVIEW, IssueStatus.DONE];

const COMMENT_TEMPLATES: string[] = [
    'Thanks for flagging this, taking a look now.',
    'I can reproduce this locally, investigating further.',
    'This looks good to me, approving.',
    'Can we get a bit more detail on the reproduction steps?',
];

@Injectable()
export class SeedService {

    constructor(
        @InjectRepository(UserProjectRole) private readonly userProjectRoleRepository: Repository<UserProjectRole>,
        private readonly projectService: ProjectService,
        private readonly userService: UserService,
        private readonly authService: AuthService,
        private readonly issueService: IssueService,
        private readonly labelService: LabelService,
        private readonly commentService: CommentService,
        private readonly loggerService: LoggerService,
    ) { }

    public async seed() {
        await this.seedAdmin();
        await this.seedMyUser();
        await this.seedUsers();
        await this.seedProjects();
    }

    private async seedAdmin() {
        if (!process.env.ADMIN_USER_EMAIL ||
            !process.env.DEFAULT_USER_FIRSTNAME ||
            !process.env.DEFAULT_USER_LASTNAME ||
            !process.env.DEFAULT_PASSWORD) {
            return;
        }

        if (await this.userService.findOneByEmail(process.env.ADMIN_USER_EMAIL)) {
            return;
        }

        const newUser: RegisterUserDto = {
            firstname: process.env.DEFAULT_USER_FIRSTNAME,
            lastname: process.env.DEFAULT_USER_LASTNAME,
            email: process.env.ADMIN_USER_EMAIL.toLocaleLowerCase(),
            password: process.env.DEFAULT_PASSWORD,
            passwordConfirmation: process.env.DEFAULT_PASSWORD,
        }

        await this.authService.registerUser(newUser, false);
        const user: User = await this.userService.findOneByEmail(newUser.email);

        if (user) {
            user.emailVerified = true;
            user.globalRole = GlobalRole.ADMIN;
            await this.userService.update(user.id, user);
        }
    }

    private async seedMyUser() {
        if (!process.env.DEFAULT_USER_EMAIL ||
            !process.env.DEFAULT_USER_FIRSTNAME ||
            !process.env.DEFAULT_USER_LASTNAME ||
            !process.env.DEFAULT_PASSWORD) {
            return;
        }

        if (await this.userService.findOneByEmail(process.env.DEFAULT_USER_EMAIL)) {
            return;
        }

        const newUser: RegisterUserDto = {
            firstname: process.env.DEFAULT_USER_FIRSTNAME,
            lastname: process.env.DEFAULT_USER_LASTNAME,
            email: process.env.DEFAULT_USER_EMAIL.toLocaleLowerCase(),
            password: process.env.DEFAULT_PASSWORD,
            passwordConfirmation: process.env.DEFAULT_PASSWORD,
        }

        await this.authService.registerUser(newUser, false);
        const user: User = await this.userService.findOneByEmail(newUser.email);

        if (user) {
            user.emailVerified = true;
            await this.userService.update(user.id, user);
        }
    }

    private async seedUsers() {
        if (!process.env.DEFAULT_PASSWORD) {
            return;
        }

        const testUsers: User[] = (await this.userService.findAll()).filter(user => user.email.includes("@test.com"));

        if (testUsers.length > 0) {
            return;
        }

        for (const testUser of users) {
            const firstname: string = testUser.firstname;
            const lastname: string = testUser.lastname;
            const createdAt: string = testUser.createdAt;

            const newUser: RegisterUserDto = {
                firstname: firstname,
                lastname: lastname,
                email: (firstname + lastname + "@test.com").toLocaleLowerCase(),
                password: process.env.DEFAULT_PASSWORD,
                passwordConfirmation: process.env.DEFAULT_PASSWORD,
            }

            await this.authService.registerUser(newUser, false);
            const user: User = await this.userService.findOneByEmail(newUser.email);

            if (user) {
                user.emailVerified = true;
                user.createdAt = new Date(createdAt);
                await this.userService.update(user.id, user);
            }
        }
    }

    private async seedProjects() {
        const testUsers: User[] = (await this.userService.findAll()).filter(user => user.email.includes("@test.com"));

        if (testUsers.length === 0) {
            return;
        }

        const existingUserProjectRole: UserProjectRole = await this.userProjectRoleRepository.findOne({ where: { user: { id: testUsers[0].id } } });

        if (existingUserProjectRole) {
            return;
        }

        // Look members up in memory instead of a DB round trip per member (email -> User is fixed for the whole seed run).
        const userByEmail = new Map<string, User>(testUsers.map(user => [user.email, user]));
        const emailFor = (person: { firstname: string; lastname: string }): string =>
            (person.firstname + person.lastname + "@test.com").toLocaleLowerCase();

        let projectIds: string[] = [];
        let newUserProjectRoles: AssignUserDto[] = [];
        let seededProjects: { project: Project; ownerId: string; memberIds: string[] }[] = [];

        for (let i = 0; i < users.length; i++) {
            const owner = userByEmail.get(emailFor(users[i]));

            const newProject: CreateProjectDto = {
                name: projects[i].name,
                description: projects[i].description,
            }

            const project: Project = await this.projectService.create(newProject, owner.id);

            if (projectUpdates.some(projectUpdate => projectUpdate.name === project.name)) {
                projectIds.push(project.id);
            }

            // Membership is fixed in test-data/projects.json (memberIndices), so the same
            // users are assigned to the same projects on every seed run.
            const memberIds: string[] = [];
            for (const memberIndex of projects[i].memberIndices) {
                const member = userByEmail.get(emailFor(users[memberIndex]));
                memberIds.push(member.id);
                newUserProjectRoles.push({
                    project,
                    user: member,
                    projectRole: ProjectRole.EDITOR,
                    createdAt: new Date(projects[i].createdAt),
                });
            }

            seededProjects.push({ project, ownerId: owner.id, memberIds });
        }

        // One batched insert instead of one awaited save per membership row.
        await this.userProjectRoleRepository.save(newUserProjectRoles);

        for (let i = 0; i < projectIds.length; i++) {
            let updateProjectDto: UpdateProjectDto = {
                name: projectUpdates[i].name,
                description: projectUpdates[i].description,
            }

            await this.projectService.update(projectIds[i], updateProjectDto);
        }

        await this.seedIssuesLabelsAndComments(seededProjects);
        await this.seedSampleBadRequests();
    }

    // Deterministic demo data for the issue tracker: a handful of labels and issues per
    // project, cycling through fixed templates by project/issue index (never Math.random),
    // so the same projects always end up with the same labels/issues/comments.
    private async seedIssuesLabelsAndComments(seededProjects: { project: Project; ownerId: string; memberIds: string[] }[]) {
        for (let i = 0; i < seededProjects.length; i++) {
            const { project, ownerId, memberIds } = seededProjects[i];
            const assignablePool = [ownerId, ...memberIds];

            const labels: Label[] = [];
            for (const labelTemplate of LABEL_TEMPLATES) {
                labels.push(await this.labelService.create(
                    { projectId: project.id, name: labelTemplate.name, color: labelTemplate.color },
                    ownerId,
                ));
            }

            const issueCount = 5;
            for (let j = 0; j < issueCount; j++) {
                const template = ISSUE_TEMPLATES[(i + j) % ISSUE_TEMPLATES.length];
                const status = ISSUE_STATUSES[(i + j) % ISSUE_STATUSES.length];
                const assigneeId = assignablePool[(i + j) % assignablePool.length];
                const label = labels[(i + j) % labels.length];

                const issue = await this.issueService.create({
                    projectId: project.id,
                    title: template.title,
                    description: template.description,
                    type: template.type,
                    priority: template.priority,
                    assigneeId,
                    labelIds: [label.id],
                }, ownerId);

                if (status !== IssueStatus.TODO) {
                    await this.issueService.update(issue.id, { status }, ownerId);
                }

                // Every other issue gets a deterministic comment from a different member.
                if (j % 2 === 1 && assignablePool.length > 1) {
                    const commenterId = assignablePool[(i + j + 1) % assignablePool.length];
                    await this.commentService.create({
                        issueId: issue.id,
                        body: COMMENT_TEMPLATES[(i + j) % COMMENT_TEMPLATES.length],
                    }, commenterId);
                }
            }
        }
    }

    // Deliberately trigger a handful of invalid requests through the normal service methods
    // (same code paths a real bad request would hit), purely so the log table also contains
    // realistic WARN entries (validation, not-found, conflict) instead of only the INFO
    // entries produced by successful seeding above. Every one of these throws before any
    // write occurs, so none of them has a side effect beyond the log row itself.
    private async seedSampleBadRequests() {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';
        const invalidId = 'not-a-valid-uuid';
        const existingTestUser = users[0];

        // Conflict: email already registered.
        try {
            await this.authService.registerUser({
                firstname: existingTestUser.firstname,
                lastname: existingTestUser.lastname,
                email: (existingTestUser.firstname + existingTestUser.lastname + "@test.com").toLocaleLowerCase(),
                password: process.env.DEFAULT_PASSWORD,
                passwordConfirmation: process.env.DEFAULT_PASSWORD,
            }, false);
        } catch { /* expected: email already registered */ }

        // Bad request: passwords don't match.
        try {
            await this.authService.registerUser({
                firstname: 'Seed',
                lastname: 'Check',
                email: 'seed-bad-request-check@test.com',
                password: 'P@ssword123',
                passwordConfirmation: 'DoesNotMatch456',
            }, false);
        } catch { /* expected: passwords don't match */ }

        // Bad request: missing required properties. Body validation happens in the global ValidationPipe
        // (before the service is reached), so this one goes through the pipe instead of AuthService.
        try {
            await createValidationPipe(this.loggerService).transform(
                { firstname: 'Seed', lastname: 'Check' },
                { type: 'body', metatype: RegisterUserDto },
            );
        } catch { /* expected: missing properties */ }

        // Not found: valid UUID shape, but no such project.
        try {
            await this.projectService.findOneById(nonExistentId);
        } catch { /* expected: project not found */ }

        // Bad request: malformed project id.
        try {
            await this.projectService.findOneById(invalidId);
        } catch { /* expected: invalid project id */ }

        // Not found: valid UUID shape, but no such user, when creating a project.
        try {
            await this.projectService.create({
                name: 'Seed check',
                description: 'Intentionally invalid; used only to generate a WARN log entry.',
            }, nonExistentId);
        } catch { /* expected: user not found */ }
    }

}
