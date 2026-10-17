import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {

    // Same rules as RegisterUserDto.password (bcrypt's 72-byte limit).
    @ApiProperty({type: String, description: 'User\'s new password.', example: 'P@ssword123'})
    @MaxLength(72)
    @MinLength(8)
    @IsString()
    password: string;

    @ApiProperty({type: String, description: 'User\'s new password again.', example: 'P@ssword123'})
    @IsNotEmpty()
    @IsString()
    passwordConfirmation: string;

}
