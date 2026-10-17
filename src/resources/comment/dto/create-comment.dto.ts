import { ApiProperty } from "@nestjs/swagger";
import { Field, ID, InputType } from "@nestjs/graphql";
import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";

@InputType()
export class CreateCommentDto {

    @ApiProperty({ type: String, description: 'Id of the issue this comment belongs to.', example: '0a7d6250-0be5-4036-8f23-33dc1762bed0' })
    @Field(() => ID)
    @IsUUID()
    issueId: string;

    @ApiProperty({ type: String, description: 'Comment\'s body.', example: 'I can reproduce this on iOS 17 Safari.' })
    @Field()
    @MaxLength(2000)
    @IsNotEmpty()
    @IsString()
    body: string;

}
