import { IsUUID } from 'class-validator';

export class SpamReportDto {
  @IsUUID()
  reportedEntityId!: string;
}
