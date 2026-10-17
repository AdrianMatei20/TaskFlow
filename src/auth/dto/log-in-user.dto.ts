import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LogInUserDto {

    @ApiProperty({type: String, description: 'User\'s email address.', example: 'adrian.matei@fakemail.com'})
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({type: String, description: 'User\'s password.', example: 'P@ssword123'})
    @IsNotEmpty()
    @IsString()
    password: string;

}
