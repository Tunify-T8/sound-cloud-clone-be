// search/search.controller.ts
import { Controller, Get, Query, Optional } from '@nestjs/common';
import { SearchService } from './search.service';
import * as usersDecorator from 'src/users/users.decorator';
import {
  GlobalSearchDto,
  SearchTracksDto,
  SearchCollectionsDto,
  SearchPeopleDto,
  AutocompleteDto,
} from './dto/search.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  globalSearch(
    @Query() query: GlobalSearchDto,
    @Optional() @usersDecorator.CurrentUser() user?: usersDecorator.JwtPayload,
  ) {
    return this.searchService.globalSearch(query, user?.userId);
  }

  @Get('tracks')
  searchTracks(@Query() query: SearchTracksDto) {
    return this.searchService.searchTracks(query);
  }

  @Get('collections')
  searchCollections(@Query() query: SearchCollectionsDto) {
    return this.searchService.searchCollections(query);
  }

  @Get('people')
  searchPeople(
    @Query() query: SearchPeopleDto,
    @Optional() @usersDecorator.CurrentUser() user?: usersDecorator.JwtPayload,
  ) {
    return this.searchService.searchPeople(query, user?.userId);
  }

  @Get('autocomplete')
  autocomplete(@Query() dto: AutocompleteDto) {
    return this.searchService.autocomplete(dto.q);
  }
}
