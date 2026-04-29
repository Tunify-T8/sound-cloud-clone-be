import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RecommendationsService } from './reccomendations.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import * as usersDecorator from 'src/users/users.decorator';
import { GetRecommendationsQueryDto, RecommendationsResponseDto } from './dto/reccomendations.dto';

@Controller('reccomendations')
export class ReccomendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @UseGuards(JwtAccessGuard)
  @Get()
  getRecommendations(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query() query: GetRecommendationsQueryDto,
  ): Promise<RecommendationsResponseDto> {
    return this.recommendationsService.getRecommendations(
      user.userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}
