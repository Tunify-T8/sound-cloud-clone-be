import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { ReportsService } from './reports.service';
import { SubmitReportDto } from '../dto/submit-report.dto';
import * as usersDecorator from 'src/users/users.decorator';
import { SpamReportDto } from '../dto/spam-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private reportService: ReportsService) {}

  @UseGuards(JwtAccessGuard)
  @Get('/reasons')
  getReportReasons() {
    return this.reportService.getReportReasons();
  }

  @UseGuards(JwtAccessGuard)
  @Post()
  submitReport(
    @Body() dto: SubmitReportDto,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.reportService.submitReport(user.userId, dto);
  }

  @UseGuards(JwtAccessGuard)
  @Post('spam')
  submitSpamReport(
    @Body() dto: SpamReportDto,
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
  ) {
    return this.reportService.submitSpamReport(
      user.userId,
      dto.reportedEntityId,
    );
  }
}
