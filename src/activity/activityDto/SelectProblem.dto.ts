import { IsString, IsUUID } from "class-validator";

export class SelectProblemDto {
    @IsUUID()
    questId: string;

    @IsString()
    roomCode: string;
}