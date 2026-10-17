import { ApiProperty } from "@nestjs/swagger";
import { Field, InputType } from "@nestjs/graphql";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";
import { IsOptionalNonNullable } from "src/shared/validation/is-optional-non-nullable.decorator";
import { HEX_COLOR_MESSAGE, HEX_COLOR_REGEX } from "./hex-color";

@InputType()
export class UpdateLabelDto {

    @ApiProperty({ type: String, description: 'Label\'s name.', example: 'frontend', required: false })
    @Field({ nullable: true })
    @IsOptionalNonNullable()
    @MaxLength(50)
    @IsNotEmpty()
    @IsString()
    name?: string;

    @ApiProperty({ type: String, description: 'Label\'s color (hex).', example: '#3b82f6', required: false })
    @Field({ nullable: true })
    @IsOptionalNonNullable()
    @Matches(HEX_COLOR_REGEX, { message: HEX_COLOR_MESSAGE })
    @IsString()
    color?: string;

}
