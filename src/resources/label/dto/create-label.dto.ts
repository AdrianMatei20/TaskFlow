import { ApiProperty } from "@nestjs/swagger";
import { Field, ID, InputType } from "@nestjs/graphql";
import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { HEX_COLOR_MESSAGE, HEX_COLOR_REGEX } from "./hex-color";

@InputType()
export class CreateLabelDto {

    @ApiProperty({ type: String, description: 'Id of the project this label belongs to.', example: '08c71152-c552-42e7-b094-f510ff44e9cb' })
    @Field(() => ID)
    @IsUUID()
    projectId: string;

    @ApiProperty({ type: String, description: 'Label\'s name.', example: 'frontend' })
    @Field()
    @MaxLength(50)
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ type: String, description: 'Label\'s color (hex).', example: '#3b82f6' })
    @Field()
    @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
    @IsString()
    color: string;

}
