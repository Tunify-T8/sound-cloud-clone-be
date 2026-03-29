import {
  Controller,
  DefaultValuePipe,
  Get,
  Optional,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import * as usersDecorator from 'src/users/users.decorator';
import { FeedService } from './feed.service';
import { GetTrendingQueryDto } from './dto/trending.dto';
import { GetDiscoverQueryDto } from './dto/discover.dto';

@Controller('feed')
export class FeedController {
  constructor(private feedService: FeedService) {}
  @Get('me')
  @UseGuards(JwtAccessGuard)
  getFeed(
    @usersDecorator.CurrentUser() user: usersDecorator.JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('includeReposts', new DefaultValuePipe(true))
    includeReposts: boolean,
    @Query('sinceTimestamp') sinceTimestamp?: string,
  ) {
    return this.feedService.getFeed(
      user.userId,
      page,
      limit,
      includeReposts === ('false' as unknown as boolean)
        ? false
        : Boolean(includeReposts),
      sinceTimestamp,
    );
  }

  @Get('trending')
  getTrending(@Query() query: GetTrendingQueryDto) {
    return this.feedService.getTrending(query);
  }

  @Get('discover')
  getDiscover(
    @Query() query: GetDiscoverQueryDto,
    @Optional() @usersDecorator.CurrentUser() user?: usersDecorator.JwtPayload,
  ) {
    return this.feedService.getDiscover(query, user?.userId);
  }
}
