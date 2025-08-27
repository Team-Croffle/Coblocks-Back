import { IsObject } from 'class-validator';

export class SubmitSolutionDto {
  @IsObject()
  submissionContent: any; // Blockly 데이터
}
