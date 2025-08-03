import { IsNotEmpty, IsString } from "class-validator";

export class SendMessageDto {
    @IsString()
    code: string;

    @IsString()
    userName: string;

    @IsString()
    @IsNotEmpty()
    message: string;
}