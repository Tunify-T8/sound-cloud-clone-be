import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportStatus, AdminAction } from '@prisma/client';

export class ResolveReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsEnum(AdminAction)
  actionTaken?: AdminAction;
}
