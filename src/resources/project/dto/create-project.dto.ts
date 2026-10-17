import { Field, InputType } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

@InputType()
export class CreateProjectDto {

    @ApiProperty({type: String, description: 'Project\'s name.', example: 'Test'})
    @Field()
    @MaxLength(25)
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({type: String, description: 'Project\'s description.', example: 'This is a test project.'})
    @Field()
    @MaxLength(500)
    @IsString()
    description: string;

}
