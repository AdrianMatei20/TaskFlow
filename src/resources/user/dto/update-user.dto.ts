import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {

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

}
