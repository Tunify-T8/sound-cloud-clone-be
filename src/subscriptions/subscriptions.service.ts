import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

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
                    maxUploads: plan.monthlyUploadMinutes === -1 ? 'unlimited' : plan.monthlyUploadMinutes,
                    adFree: plan.adFree,
                    offlineListening: plan.allowOfflineListening,
                    playbackAccess: plan.playbackAccess,
                    playlistLimit: plan.playlistLimit === -1 ? 'unlimited' : plan.playlistLimit,
                }
            })),
        };
    }

    async getMySubscription(userId: string) {
        const subscription = await this.prisma.subscription.findFirst({
            where: {
                userId,
                status: 'ACTIVE',
                },
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    plan: {
                        select: {
                            name: true,
                            monthlyUploadMinutes: true,
                            adFree: true,
                            allowOfflineListening: true,
                            playbackAccess: true,
                            playlistLimit: true,
                        }
                    }
                },
        });

        if (!subscription) {
            return {
                plan: 'free',
                status: 'active',
                startedAt: null,
                endedAt: null,
                autoRenew: false,
                features: {
                    maxUploads: 180,
                    adFree: false,
                    offlineListening: false,
                    playbackAccess: false,
                    playlistLimit: 3,
            
                }
            };
        }

        const plan = subscription.plan;
        return {
            plan: subscription?.plan?.name,
            status: subscription?.status,
            startedAt: subscription?.startedAt,
            endedAt: subscription?.endedAt,
            autoRenew: subscription?.autoRenew,
            features: plan ? {
                maxUploads: plan.monthlyUploadMinutes === -1 ? 'unlimited' : plan.monthlyUploadMinutes,
                adFree: plan.adFree,
                offlineListening: plan.allowOfflineListening,
                playbackAccess: plan.playbackAccess,
                playlistLimit: plan.playlistLimit === -1 ? 'unlimited' : plan.playlistLimit,
            } : undefined
        };
    }

    async subscribe(userId: string, dto: SubscribeDto) {
        const { plan, billingCycle, paymentMethod, card, trialDays } = dto;

        // if user chose card payment, card details must be provided
        if (paymentMethod === 'card' && !card) {
            throw new BadRequestException('Card details are required for card payments');
        }   

        // simulate dummy validation, awel haga gat f bali idk
        if(card?.last4 === '0000') {
            throw new Error('Invalid card details, card was declined');
        }

        //cancel any existing active subscription
        const currentSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId,
                status: 'ACTIVE',
            },
        });

        if(currentSubscription) {
            await this.prisma.subscription.update({
                where: { id: currentSubscription.id },
                data: {
                    status: 'CANCELLED',
                    autoRenew: false,
                },
            });
        }

        const subscriptionPlan = await this.prisma.subscriptionPlan.findUnique({
            where: { name: plan },
        });

        if (!subscriptionPlan) {
            throw new NotFoundException('Invalid subscription plan');
        }

        const now = new Date();
        // Calculate start and end dates based on trial and billing cycle
        const startDate = trialDays > 0 ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : now;
        const endDate = this.calculateEndDate(startDate, billingCycle);

        const newSubscription = await this.prisma.subscription.create({
            data: {
                userId,
                planId: subscriptionPlan.id,
                billingCycle: billingCycle.toLowerCase(),
                status: 'ACTIVE',
                autoRenew: true,
                startedAt: startDate,
                endedAt: endDate,
                trialEndsAt: trialDays > 0 ? startDate : null,
            }
        });

        await this.prisma.payment.create({
            data: {
                userId,
                subscriptionId: newSubscription.id,
                amount: billingCycle.toLowerCase() === 'monthly' ? subscriptionPlan.monthlyPrice : subscriptionPlan.yearlyPrice,
                paymentMethod: paymentMethod.toUpperCase(),
                status: 'SUCCEEDED',
                cardLast4: card?.last4,
                cardBrand: card?.brand,
                cardExpiryMonth: card?.expiryMonth, 
                cardExpiryYear: card?.expiryYear,
            }
        }); 

        return {
            message: "Subscription successful"
        }
    }

    private calculateEndDate(startDate: Date, billingCycle: string): Date {
        const endDate = new Date(startDate);
        if (billingCycle.toLowerCase() === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
        } else if (billingCycle.toLowerCase() === 'yearly') {
            endDate.setFullYear(endDate.getFullYear() + 1);
        }
        return endDate;
    }

    async cancelSubscription(userId: string) {
        const subscription = await this.prisma.subscription.findFirst({
            where: {
                userId,
                status: 'ACTIVE',
            },
        });

        if (!subscription) {
            throw new NotFoundException('No active subscription found to cancel');
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                autoRenew: false,
            },
        });

        return {
            message: 'Subscription auto renwal cancelled successfully',
            expiresAt: subscription.endedAt,
        };
    }
}
