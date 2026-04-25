import { IsEnum, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';
import { ReportedEntityType, ViolationArea } from '@prisma/client';

export class SubmitReportDto {
  @IsEnum(ReportedEntityType)
  reportedEntityType!: ReportedEntityType;

  @IsUUID()
  reportedEntityId!: string;

  @IsString()
  reasonId!: string;

  @IsOptional()
  @IsString()
  detailsText?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ViolationArea, { each: true })
  violationAreas?: ViolationArea[];
}
