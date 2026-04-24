import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { SubscriptionsService } from './subscriptions.service';
import { SubscribeDto } from './dto/subscribe.dto';
@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly subscriptionsService: SubscriptionsService) {}

    @Get('plans')
    @UseGuards(JwtAccessGuard)
    getSubscriptionPlans() {
        return this.subscriptionsService.getSubscriptionPlans();
    }

    @Get('me')
    @UseGuards(JwtAccessGuard)
    getMySubscription(@Request() req) {
        return this.subscriptionsService.getMySubscription(req.user.userId);
    }

    @Post('cancel')
    @UseGuards(JwtAccessGuard)
    cancelSubscription(@Request() req) {
        return this.subscriptionsService.cancelSubscription(req.user.userId);
    }

    @Post('subscribe')
    @UseGuards(JwtAccessGuard)
    async subscribe(
        @Request() req,
        @Body() subscribeDto: SubscribeDto
    ) {
        try {
            const response = await this.subscriptionsService.subscribe(
                req.user.userId,
                subscribeDto,
            );
            return response;
        } catch (error) 
        {
            if (error instanceof Error && error.message.includes('declined')) 
            {
                throw new BadRequestException(
                {
                    error: 'payment_failed',
                    message: error.message,
                });
            }
            throw error;
        }
    }
}
