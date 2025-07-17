import { IsString, IsUUID } from "class-validator";

export class CreateClassroomDto {
    @IsUUID()
    id: string;

    @IsString()
    code: string;

    @IsUUID()
    managerId: string;
}