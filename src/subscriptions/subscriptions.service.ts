import { Injectable } from '@nestjs/common';
import { features } from 'process';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
    constructor(private prisma: PrismaService) {}

    async getSubscriptionPlans() {
        const plans = await this.prisma.subscriptionPlan.findMany({
            orderBy: {
                monthlyPrice: 'asc',
            },
        });

        return {
            plans: plans.map(plan => ({
                name: plan.name,
                monthlyPrice: plan.monthlyPrice,
                yearlyPrice: plan.yearlyPrice,
                currency: "EGP",
                features: {
                    maxUploads: plan.monthlyUploadMinutes,
                    adFree: plan.adFree,
                    offlineListening: plan.allowOfflineListening,
                    allowReplace: plan.allowReplace,
                }
            })),
        };
    }

}
