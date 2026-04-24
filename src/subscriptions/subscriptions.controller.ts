import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { SubscriptionsService } from './subscriptions.service';
@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly subscriptionsService: SubscriptionsService) {}

    @Get('plans')
    @UseGuards(JwtAccessGuard)
    getSubscriptionPlans() {
        return this.subscriptionsService.getSubscriptionPlans();
    }
}
