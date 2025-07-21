import { IsNotEmpty, IsString } from "class-validator";

export class SendMessageDto {
    @IsString()
    roomCode: string;

    @IsString()
    username: string;

    @IsString()
    @IsNotEmpty()
    message: string;
}