import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/request';
import { CreateListingDto, SearchListingsQuery, UpdateListingDto } from './listing.dto';
import { ListingsService } from './listings.service';

@Controller('public/listings')
export class PublicListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  search(@Query() query: SearchListingsQuery) {
    return this.listings.search(query);
  }

  @Get('destinations')
  destinations(@Query('q') q = '') {
    return this.listings.destinations(String(q).slice(0, 120));
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.publicDetail(id);
  }
}

@Controller('admin/listings')
@UseGuards(SessionGuard)
export class AdminListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  list() {
    return this.listings.adminList();
  }

  @Post()
  create(@Body() dto: CreateListingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.listings.create(dto.title, user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.adminGet(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateListingDto) {
    return this.listings.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.listings.remove(id);
  }
}
