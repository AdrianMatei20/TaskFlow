import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class ForgotPasswordDto {

    @ApiProperty({type: String, description: 'User\'s email address.', example: 'adrian.matei@fakemail.com'})
    @IsEmail()
    @IsNotEmpty()
    email: string;
    
}
