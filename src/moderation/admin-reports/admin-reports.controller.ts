import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AdminOnly } from 'src/auth/decorators/roles.decorator';
import { AdminReportsService } from './admin-reports.service';
import { QueryReportsDto } from '../dto/query-reports.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';
import * as usersDecorator from 'src/users/users.decorator';


@UseGuards(JwtAccessGuard, RolesGuard)
@AdminOnly()
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get()
  getReports(@Query() query: QueryReportsDto) {
    return this.adminReportsService.getReports(query);
  }

  @Get(':reportId')
  getReportById(@Param('reportId') reportId: string) {
    return this.adminReportsService.getReportById(reportId);
  }

  @Patch(':reportId')
  resolveReport(
    @Param('reportId') reportId: string,
    @Body() dto: ResolveReportDto,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.adminReportsService.resolveReport(reportId, user.userId, dto);
  }
}
