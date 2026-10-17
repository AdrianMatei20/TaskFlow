import { ApiProperty } from "@nestjs/swagger";
import { Field, InputType } from "@nestjs/graphql";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

@InputType()
export class UpdateCommentDto {

    @ApiProperty({ type: String, description: 'Comment\'s body.', example: 'I can reproduce this on iOS 17 Safari.' })
    @Field()
    @MaxLength(2000)
    @IsNotEmpty()
    @IsString()
    body: string;

}
