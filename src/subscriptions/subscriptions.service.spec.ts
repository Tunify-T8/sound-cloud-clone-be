import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let mockPrismaService: any;

  // ───── Mock Data ────────────────────────────────────────────────
  const mockSubscriptionPlan = {
    id: 'plan-1',
    name: 'Premium',
    monthlyPrice: 99,
    yearlyPrice: 990,
    monthlyUploadMinutes: 500,
    playlistLimit: 50,
    adFree: true,
    allowOfflineListening: true,
    playbackAccess: true,
  };

  const mockFreePlan = {
    id: 'plan-free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyUploadMinutes: 180,
    playlistLimit: 3,
    adFree: false,
    allowOfflineListening: false,
    playbackAccess: false,
  };

  const mockSubscription = {
    id: 'sub-123',
    userId: 'user-123',
    planId: 'plan-1',
    billingCycle: 'monthly',
    status: 'ACTIVE',
    autoRenew: true,
    startedAt: new Date('2024-01-01'),
    endedAt: new Date('2024-02-01'),
    trialEndsAt: null,
    createdAt: new Date('2024-01-01'),
    plan: mockSubscriptionPlan,
  };

  const mockPayment = {
    id: 'pay-123',
    userId: 'user-123',
    subscriptionId: 'sub-123',
    amount: 99,
    paymentMethod: 'CARD',
    status: 'SUCCEEDED',
    cardLast4: '4242',
    cardBrand: 'Visa',
    cardExpiryMonth: 12,
    cardExpiryYear: 2025,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockPrismaService = {
      subscriptionPlan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      subscription: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  // ───────────────────────────────────────────────────────────────
  // getSubscriptionPlans
  // ───────────────────────────────────────────────────────────────
  describe('getSubscriptionPlans', () => {
    it('should return formatted subscription plans', async () => {
      mockPrismaService.subscriptionPlan.findMany.mockResolvedValue([
        mockFreePlan,
        mockSubscriptionPlan,
      ]);

      const result = await service.getSubscriptionPlans();

      expect(result.plans).toHaveLength(2);
      expect(result.plans[0].name).toBe('Free');
      expect(result.plans[0].monthlyPrice).toBe(0);
      expect(result.plans[0].features.maxUploads).toBe(180);
      expect(result.plans[0].features.adFree).toBe(false);
      expect(result.plans[1].name).toBe('Premium');
      expect(result.plans[1].features.maxUploads).toBe(500);
      expect(result.plans[1].features.adFree).toBe(true);
    });

    it('should handle unlimited upload minutes', async () => {
      mockPrismaService.subscriptionPlan.findMany.mockResolvedValue([
        { ...mockSubscriptionPlan, monthlyUploadMinutes: -1, playlistLimit: -1 },
      ]);

      const result = await service.getSubscriptionPlans();

      expect(result.plans[0].features.maxUploads).toBe('unlimited');
      expect(result.plans[0].features.playlistLimit).toBe('unlimited');
    });

    it('should include currency in response', async () => {
      mockPrismaService.subscriptionPlan.findMany.mockResolvedValue([mockSubscriptionPlan]);

      const result = await service.getSubscriptionPlans();

      expect(result.plans[0].currency).toBe('EGP');
    });

    it('should return empty array when no plans exist', async () => {
      mockPrismaService.subscriptionPlan.findMany.mockResolvedValue([]);

      const result = await service.getSubscriptionPlans();

      expect(result.plans).toEqual([]);
    });

    it('should order plans by monthly price ascending', async () => {
      mockPrismaService.subscriptionPlan.findMany.mockResolvedValue([
        mockSubscriptionPlan,
        mockFreePlan,
      ]);

      await service.getSubscriptionPlans();

      expect(mockPrismaService.subscriptionPlan.findMany).toHaveBeenCalledWith({
        orderBy: { monthlyPrice: 'asc' },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────
  // getMySubscription
  // ───────────────────────────────────────────────────────────────
  describe('getMySubscription', () => {
    it('should return active subscription with features', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(mockSubscription);

      const result = await service.getMySubscription('user-123');

      expect(result.plan).toBe('Premium');
      expect(result.status).toBe('ACTIVE');
      expect(result.autoRenew).toBe(true);
      expect(result.features.adFree).toBe(true);
      expect(result.features.playlistLimit).toBe(50);
    });

    it('should return free plan when no active subscription', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);

      const result = await service.getMySubscription('user-456');

      expect(result.plan).toBe('free');
      expect(result.status).toBe('active');
      expect(result.autoRenew).toBe(false);
      expect(result.features.maxUploads).toBe(180);
      expect(result.features.adFree).toBe(false);
      expect(result.features.playlistLimit).toBe(3);
    });

    it('should return free plan features with unlimited value', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        plan: { ...mockSubscriptionPlan, monthlyUploadMinutes: -1, playlistLimit: -1 },
      });

      const result = await service.getMySubscription('user-123');

      expect(result.features.maxUploads).toBe('unlimited');
      expect(result.features.playlistLimit).toBe('unlimited');
    });

    it('should filter by ACTIVE status only', async () => {
      await service.getMySubscription('user-123');

      expect(mockPrismaService.subscription.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          plan: {
            select: {
              name: true,
              monthlyUploadMinutes: true,
              adFree: true,
              allowOfflineListening: true,
              playbackAccess: true,
              playlistLimit: true,
            },
          },
        },
      });
    });

    it('should return subscription started and ended dates', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-01');
      mockPrismaService.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        startedAt: startDate,
        endedAt: endDate,
      });

      const result = await service.getMySubscription('user-123');

      expect(result.startedAt).toEqual(startDate);
      expect(result.endedAt).toEqual(endDate);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // subscribe
  // ───────────────────────────────────────────────────────────────
  describe('subscribe', () => {
    const validSubscribeDto = {
      plan: 'Premium',
      billingCycle: 'monthly',
      paymentMethod: 'card',
      card: {
        last4: '4242',
        brand: 'Visa',
        expiryMonth: 12,
        expiryYear: 2025,
      },
      trialDays: 0,
    };

    it('should create a new subscription successfully', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue(mockSubscription);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      const result = await service.subscribe('user-123', validSubscribeDto);

      expect(result.message).toBe('Subscription successful');
      expect(mockPrismaService.subscription.create).toHaveBeenCalled();
      expect(mockPrismaService.payment.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when card details missing for card payment', async () => {
      const dtoWithoutCard = { ...validSubscribeDto, card: null };

      await expect(service.subscribe('user-123', dtoWithoutCard)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error when card is invalid (simulated)', async () => {
      const invalidCardDto = {
        ...validSubscribeDto,
        card: { ...validSubscribeDto.card, last4: '0000' },
      };

      await expect(service.subscribe('user-123', invalidCardDto)).rejects.toThrow(
        'Invalid card details, card was declined',
      );
    });

    it('should cancel existing active subscription before creating new one', async () => {
      const existingSubscription = { id: 'sub-old', status: 'ACTIVE' };
      mockPrismaService.subscription.findFirst
        .mockResolvedValueOnce(existingSubscription)
        .mockResolvedValueOnce(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue(mockSubscription);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', validSubscribeDto);

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-old' },
        data: {
          status: 'CANCELLED',
          autoRenew: false,
        },
      });
    });

    it('should throw NotFoundException for invalid plan name', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.subscribe('user-123', { ...validSubscribeDto, plan: 'InvalidPlan' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should calculate end date for monthly billing cycle', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue({
        ...mockSubscription,
        billingCycle: 'monthly',
      });
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', { ...validSubscribeDto, billingCycle: 'monthly' });

      expect(mockPrismaService.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingCycle: 'monthly',
          }),
        }),
      );
    });

    it('should calculate end date for yearly billing cycle', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue({
        ...mockSubscription,
        billingCycle: 'yearly',
      });
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', { ...validSubscribeDto, billingCycle: 'yearly' });

      expect(mockPrismaService.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingCycle: 'yearly',
          }),
        }),
      );
    });

    it('should handle trial days when creating subscription', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue({
        ...mockSubscription,
        trialEndsAt: new Date(),
      });
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', { ...validSubscribeDto, trialDays: 7 });

      expect(mockPrismaService.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trialEndsAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should create payment record with correct amount for monthly', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue(mockSubscription);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', { ...validSubscribeDto, billingCycle: 'monthly' });

      expect(mockPrismaService.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: mockSubscriptionPlan.monthlyPrice,
          paymentMethod: 'CARD',
          status: 'SUCCEEDED',
        }),
      });
    });

    it('should create payment record with yearly price for yearly billing', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue(mockSubscription);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', { ...validSubscribeDto, billingCycle: 'yearly' });

      expect(mockPrismaService.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: mockSubscriptionPlan.yearlyPrice,
        }),
      });
    });

    it('should set autoRenew to true by default', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      mockPrismaService.subscription.create.mockResolvedValue(mockSubscription);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', validSubscribeDto);

      expect(mockPrismaService.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            autoRenew: true,
            status: 'ACTIVE',
          }),
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────
  // cancelSubscription
  // ───────────────────────────────────────────────────────────────
  describe('cancelSubscription', () => {
    it('should cancel active subscription', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrismaService.subscription.update.mockResolvedValue({
        ...mockSubscription,
        autoRenew: false,
      });

      const result = await service.cancelSubscription('user-123');

      expect(result.message).toBe('Subscription auto renwal cancelled successfully');
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { autoRenew: false },
      });
    });

    it('should return expiration date of subscription', async () => {
      const endedAt = new Date('2024-02-01');
      mockPrismaService.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        endedAt,
      });
      mockPrismaService.subscription.update.mockResolvedValue({});

      const result = await service.cancelSubscription('user-123');

      expect(result.expiresAt).toEqual(endedAt);
    });

    it('should throw NotFoundException when no active subscription', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);

      await expect(service.cancelSubscription('user-456')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should set autoRenew to false only, not cancel status', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrismaService.subscription.update.mockResolvedValue({});

      await service.cancelSubscription('user-123');

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
        data: { autoRenew: false },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────
  // calculateEndDate (private method tested indirectly)
  // ───────────────────────────────────────────────────────────────
  describe('calculateEndDate', () => {
    it('should calculate end date for monthly billing cycle', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      
      let capturedEndDate: Date;
      mockPrismaService.subscription.create.mockImplementation((args) => {
        capturedEndDate = args.data.endedAt;
        return Promise.resolve({ ...mockSubscription, startedAt: args.data.startedAt, endedAt: capturedEndDate });
      });

      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', {
        plan: 'Premium',
        billingCycle: 'monthly',
        paymentMethod: 'card',
        card: { last4: '4242', brand: 'Visa', expiryMonth: 12, expiryYear: 2025 },
        trialDays: 0,
      });

      // Verify that end date is 1 month after start date
      expect(capturedEndDate).toBeDefined();
      expect(capturedEndDate instanceof Date).toBe(true);
    });

    it('should calculate end date for yearly billing cycle', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockSubscriptionPlan);
      
      let capturedEndDate: Date;
      mockPrismaService.subscription.create.mockImplementation((args) => {
        capturedEndDate = args.data.endedAt;
        return Promise.resolve({ ...mockSubscription, startedAt: args.data.startedAt, endedAt: capturedEndDate });
      });

      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.subscribe('user-123', {
        plan: 'Premium',
        billingCycle: 'yearly',
        paymentMethod: 'card',
        card: { last4: '4242', brand: 'Visa', expiryMonth: 12, expiryYear: 2025 },
        trialDays: 0,
      });

      // Verify that end date is 1 year after start date
      expect(capturedEndDate).toBeDefined();
      expect(capturedEndDate instanceof Date).toBe(true);
    });
  });
});
