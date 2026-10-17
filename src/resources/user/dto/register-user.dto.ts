import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterUserDto {

    @ApiProperty({type: String, description: 'User\'s firstname.', example: 'Adrian'})
    @MaxLength(25)
    @IsNotEmpty()
    @IsString()
    firstname: string;

    @ApiProperty({type: String, description: 'User\'s lastname.', example: 'Matei'})
    @MaxLength(25)
    @IsNotEmpty()
    @IsString()
    lastname: string;

    @ApiProperty({type: String, description: 'User\'s email address.', example: 'adrian.matei@fakemail.com'})
    @MaxLength(100)
    @IsEmail()
    email: string;

    // bcrypt ignores everything past 72 bytes, so longer passwords are rejected rather than silently truncated.
    @ApiProperty({type: String, description: 'User\'s password.', example: 'P@ssword123'})
    @MaxLength(72)
    @MinLength(8)
    @IsString()
    password: string;

    @ApiProperty({type: String, description: 'User\'s password again.', example: 'P@ssword123'})
    @IsNotEmpty()
    @IsString()
    passwordConfirmation: string;

}
