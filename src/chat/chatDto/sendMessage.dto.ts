import { IsNotEmpty, IsString } from "class-validator";

export class SendMessageDto {
    @IsString()
    roomCode: string;

    @IsString()
    userName: string;

    @IsString()
    @IsNotEmpty()
    message: string;
}