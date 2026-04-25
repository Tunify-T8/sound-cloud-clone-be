import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AdminOnly } from 'src/auth/decorators/roles.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AnalyticsQueryDto, TopStatsQueryDto } from '../dto/analytics-query.dto';

@UseGuards(JwtAccessGuard, RolesGuard)
@AdminOnly()
@Controller('admin/stats')
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('summary')
  getSummary() {
    return this.adminAnalyticsService.getSummary();
  }

  @Get('analytics')
  getAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.adminAnalyticsService.getAnalytics(query);
  }

  @Get('top')
  getTopStats(@Query() query: TopStatsQueryDto) {
    return this.adminAnalyticsService.getTopStats(query);
  }

  @Get('reports')
  getReportStats() {
    return this.adminAnalyticsService.getReportStats();
  }
}
