import { ApiProperty } from "@nestjs/swagger";
import { Field, ID, InputType } from "@nestjs/graphql";
import { Type } from "class-transformer";
import { IsArray, IsDate, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { IsOptionalNonNullable } from "src/shared/validation/is-optional-non-nullable.decorator";
import { IssueType } from "../enums/issue-type";
import { IssuePriority } from "../enums/issue-priority";

@InputType()
export class CreateIssueDto {

    @ApiProperty({ type: String, description: 'Id of the project this issue belongs to.', example: '08c71152-c552-42e7-b094-f510ff44e9cb' })
    @Field(() => ID)
    @IsUUID()
    projectId: string;

    @ApiProperty({ type: String, description: 'Issue\'s title.', example: 'Login button is unresponsive on mobile' })
    @Field()
    @MaxLength(200)
    @IsNotEmpty()
    @IsString()
    title: string;

    @ApiProperty({ type: String, description: 'Issue\'s description.', example: 'Tapping the login button on iOS Safari does nothing.' })
    @Field()
    @MaxLength(2000)
    @IsString()
    description: string;

    @ApiProperty({ type: String, enum: IssueType, description: 'Issue\'s type.', example: IssueType.BUG, required: false })
    @Field(() => IssueType, { nullable: true })
    @IsOptionalNonNullable()
    @IsEnum(IssueType)
    type?: IssueType;

    @ApiProperty({ type: String, enum: IssuePriority, description: 'Issue\'s priority.', example: IssuePriority.HIGH, required: false })
    @Field(() => IssuePriority, { nullable: true })
    @IsOptionalNonNullable()
    @IsEnum(IssuePriority)
    priority?: IssuePriority;

    @ApiProperty({ type: String, description: 'Id of the user to assign this issue to.', example: 'af7c1fe6-d669-414e-b066-e9733f0de7a8', required: false })
    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsUUID()
    assigneeId?: string;

    @ApiProperty({ type: Date, description: 'Issue\'s due date.', example: '2026-12-01T00:00:00.000Z', required: false })
    @Field({ nullable: true })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    dueDate?: Date;

    @ApiProperty({ type: String, isArray: true, description: 'Ids of the labels to attach to this issue.', example: ['3b0872df-d47a-48f4-964e-b6a099964ee7'], required: false })
    @Field(() => [ID], { nullable: true })
    @IsOptionalNonNullable()
    @IsUUID('all', { each: true })
    @IsArray()
    labelIds?: string[];

}
