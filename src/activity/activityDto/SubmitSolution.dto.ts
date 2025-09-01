import { IsString } from 'class-validator';

export class SubmitSolutionDto {
  @IsString()
  submissionContent: string; // Blockly 데이터
}
