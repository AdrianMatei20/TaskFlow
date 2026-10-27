import { ApiProperty } from "@nestjs/swagger";
import { Field, ID, ObjectType } from "@nestjs/graphql";
import { Issue } from "../entities/issue.entity";
import { IssueType } from "../enums/issue-type";
import { IssueStatus } from "../enums/issue-status";
import { IssuePriority } from "../enums/issue-priority";

@ObjectType()
export class IssuePersonDto {

    @ApiProperty({ type: String, description: 'User\'s id.', example: 'af7c1fe6-d669-414e-b066-e9733f0de7a8' })
    @Field(() => ID)
    readonly id: string;

    @ApiProperty({ type: String, description: 'User\'s firstname.', example: 'Adrian' })
    @Field()
    readonly firstname: string;

    @ApiProperty({ type: String, description: 'User\'s lastname.', example: 'Matei' })
    @Field()
    readonly lastname: string;

    constructor(user: { id: string; firstname: string; lastname: string }) {
        this.id = user.id;
        this.firstname = user.firstname;
        this.lastname = user.lastname;
    }

}

@ObjectType()
export class IssueLabelDto {

    @ApiProperty({ type: String, description: 'Label\'s id.', example: '3b0872df-d47a-48f4-964e-b6a099964ee7' })
    @Field(() => ID)
    readonly id: string;

    @ApiProperty({ type: String, description: 'Label\'s name.', example: 'frontend' })
    @Field()
    readonly name: string;

    @ApiProperty({ type: String, description: 'Label\'s color (hex).', example: '#3b82f6' })
    @Field()
    readonly color: string;

    constructor(label: { id: string; name: string; color: string }) {
        this.id = label.id;
        this.name = label.name;
        this.color = label.color;
    }

}

@ObjectType()
export class PublicIssueDto {

    @ApiProperty({ type: String, description: 'Issue\'s id.', example: '0a7d6250-0be5-4036-8f23-33dc1762bed0' })
    @Field(() => ID)
    readonly id: string;

    @ApiProperty({ type: String, description: 'Id of the project this issue belongs to.', example: '08c71152-c552-42e7-b094-f510ff44e9cb' })
    @Field(() => ID)
    readonly projectId: string;

    @ApiProperty({ type: String, description: 'Issue\'s title.', example: 'Login button is unresponsive on mobile' })
    @Field()
    readonly title: string;

    @ApiProperty({ type: String, description: 'Issue\'s description.', example: 'Tapping the login button on iOS Safari does nothing.' })
    @Field()
    readonly description: string;

    @ApiProperty({ type: String, enum: IssueType, description: 'Issue\'s type.', example: IssueType.BUG })
    @Field(() => IssueType)
    readonly type: IssueType;

    @ApiProperty({ type: String, enum: IssueStatus, description: 'Issue\'s status.', example: IssueStatus.TODO })
    @Field(() => IssueStatus)
    readonly status: IssueStatus;

    @ApiProperty({ type: String, enum: IssuePriority, description: 'Issue\'s priority.', example: IssuePriority.HIGH })
    @Field(() => IssuePriority)
    readonly priority: IssuePriority;

    // reporter/assignee are undefined (not null) when the relation wasn't loaded; the GraphQL field resolvers in
    // IssueResolver then load the user from reporterId/assigneeId.
    @ApiProperty({ type: IssuePersonDto, description: 'User who reported this issue.', nullable: true })
    @Field(() => IssuePersonDto, { nullable: true })
    readonly reporter: IssuePersonDto | null | undefined;

    @ApiProperty({ type: String, description: 'Id of the user who reported this issue.', nullable: true, example: 'af7c1fe6-d669-414e-b066-e9733f0de7a8' })
    @Field(() => ID, { nullable: true })
    readonly reporterId: string | null;

    @ApiProperty({ type: IssuePersonDto, description: 'User this issue is assigned to.', nullable: true })
    @Field(() => IssuePersonDto, { nullable: true })
    readonly assignee: IssuePersonDto | null | undefined;

    @ApiProperty({ type: String, description: 'Id of the user this issue is assigned to.', nullable: true, example: 'af7c1fe6-d669-414e-b066-e9733f0de7a8' })
    @Field(() => ID, { nullable: true })
    readonly assigneeId: string | null;

    @ApiProperty({ type: IssueLabelDto, isArray: true, description: 'Labels attached to this issue.' })
    @Field(() => [IssueLabelDto])
    readonly labels: IssueLabelDto[];

    @ApiProperty({ type: Date, description: 'Issue\'s due date.', nullable: true })
    @Field({ nullable: true })
    readonly dueDate: Date | null;

    @ApiProperty({ type: Date, description: 'Issue\'s creation date.' })
    @Field()
    readonly createdAt: Date;

    @ApiProperty({ type: Date, description: 'Issue\'s last update date.' })
    @Field()
    readonly updatedAt: Date;

    constructor(issue: Issue) {
        this.id = issue.id;
        this.projectId = issue.project?.id ?? issue.projectId;
        this.title = issue.title;
        this.description = issue.description;
        this.type = issue.type;
        this.status = issue.status;
        this.priority = issue.priority;
        this.reporter = issue.reporter === undefined ? undefined : issue.reporter && new IssuePersonDto(issue.reporter);
        this.reporterId = issue.reporter?.id ?? issue.reporterId ?? null;
        this.assignee = issue.assignee === undefined ? undefined : issue.assignee && new IssuePersonDto(issue.assignee);
        this.assigneeId = issue.assignee?.id ?? issue.assigneeId ?? null;
        this.labels = (issue.labels ?? []).map(label => new IssueLabelDto(label));
        this.dueDate = issue.dueDate;
        this.createdAt = issue.createdAt;
        this.updatedAt = issue.updatedAt;
    }

}
