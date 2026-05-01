import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let service: SubscriptionsService;

  // ───── Mock Data ────────────────────────────────────────────────
  const mockPlansResponse = {
    plans: [
      {
        name: 'Free',
        monthlyPrice: 0,
        yearlyPrice: 0,
        currency: 'EGP',
        features: {
          maxUploads: 180,
          adFree: false,
          offlineListening: false,
          playbackAccess: false,
          playlistLimit: 3,
        },
      },
      {
        name: 'Premium',
        monthlyPrice: 99,
        yearlyPrice: 990,
        currency: 'EGP',
        features: {
          maxUploads: 500,
          adFree: true,
          offlineListening: true,
          playbackAccess: true,
          playlistLimit: 50,
        },
      },
    ],
  };

  const mockSubscriptionResponse = {
    plan: 'Premium',
    status: 'ACTIVE',
    startedAt: new Date('2024-01-01'),
    endedAt: new Date('2024-02-01'),
    autoRenew: true,
    features: {
      maxUploads: 500,
      adFree: true,
      offlineListening: true,
      playbackAccess: true,
      playlistLimit: 50,
    },
  };

  const mockRequest = {
    user: { userId: 'user-123' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: {
            getSubscriptionPlans: jest.fn(),
            getMySubscription: jest.fn(),
            cancelSubscription: jest.fn(),
            subscribe: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  // ───────────────────────────────────────────────────────────────
  // GET /subscriptions/plans
  // ───────────────────────────────────────────────────────────────
  describe('GET /subscriptions/plans', () => {
    it('should return all subscription plans', async () => {
      jest.spyOn(service, 'getSubscriptionPlans').mockResolvedValue(mockPlansResponse);

      const result = await controller.getSubscriptionPlans();

      expect(result).toEqual(mockPlansResponse);
      expect(service.getSubscriptionPlans).toHaveBeenCalled();
    });

    it('should include currency in response', async () => {
      jest.spyOn(service, 'getSubscriptionPlans').mockResolvedValue(mockPlansResponse);

      const result = await controller.getSubscriptionPlans();

      result.plans.forEach((plan) => {
        expect(plan.currency).toBe('EGP');
      });
    });

    it('should include all plan features', async () => {
      jest.spyOn(service, 'getSubscriptionPlans').mockResolvedValue(mockPlansResponse);

      const result = await controller.getSubscriptionPlans();

      result.plans.forEach((plan) => {
        expect(plan.features).toHaveProperty('maxUploads');
        expect(plan.features).toHaveProperty('adFree');
        expect(plan.features).toHaveProperty('offlineListening');
        expect(plan.features).toHaveProperty('playbackAccess');
        expect(plan.features).toHaveProperty('playlistLimit');
      });
    });

    it('should return empty plans array when none exist', async () => {
      jest.spyOn(service, 'getSubscriptionPlans').mockResolvedValue({ plans: [] });

      const result = await controller.getSubscriptionPlans();

      expect(result.plans).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // GET /subscriptions/me
  // ───────────────────────────────────────────────────────────────
  describe('GET /subscriptions/me', () => {
    it('should return current user subscription', async () => {
      jest.spyOn(service, 'getMySubscription').mockResolvedValue(mockSubscriptionResponse);

      const result = await controller.getMySubscription(mockRequest);

      expect(result).toEqual(mockSubscriptionResponse);
      expect(service.getMySubscription).toHaveBeenCalledWith('user-123');
    });

    it('should return free plan when no active subscription', async () => {
      const freeResponse = {
        plan: 'free',
        status: 'active',
        startedAt: null,
        endedAt: null,
        autoRenew: false,
        features: {
          maxUploaks: 180,
          adFree: false,
          offlineListening: false,
          playbackAccess: false,
          playlistLimit: 3,
        },
      };
      jest.spyOn(service, 'getMySubscription').mockResolvedValue(freeResponse);

      const result = await controller.getMySubscription(mockRequest);

      expect(result.plan).toBe('free');
      expect(result.autoRenew).toBe(false);
    });

    it('should include subscription dates', async () => {
      jest.spyOn(service, 'getMySubscription').mockResolvedValue(mockSubscriptionResponse);

      const result = await controller.getMySubscription(mockRequest);

      expect(result.startedAt).toBeDefined();
      expect(result.endedAt).toBeDefined();
    });

    it('should pass correct user ID to service', async () => {
      jest.spyOn(service, 'getMySubscription').mockResolvedValue(mockSubscriptionResponse);

      await controller.getMySubscription(mockRequest);

      expect(service.getMySubscription).toHaveBeenCalledWith('user-123');
    });
  });

  // ───────────────────────────────────────────────────────────────
  // POST /subscriptions/subscribe
  // ───────────────────────────────────────────────────────────────
  describe('POST /subscriptions/subscribe', () => {
    const subscribeDto = {
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

    it('should subscribe user successfully', async () => {
      jest
        .spyOn(service, 'subscribe')
        .mockResolvedValue({ message: 'Subscription successful' });

      const result = await controller.subscribe(mockRequest, subscribeDto);

      expect(result.message).toBe('Subscription successful');
      expect(service.subscribe).toHaveBeenCalledWith('user-123', subscribeDto);
    });

    it('should pass correct user ID to service', async () => {
      jest
        .spyOn(service, 'subscribe')
        .mockResolvedValue({ message: 'Subscription successful' });

      await controller.subscribe(mockRequest, subscribeDto);

      expect(service.subscribe).toHaveBeenCalledWith('user-123', expect.any(Object));
    });

    it('should handle payment declined error with BadRequestException', async () => {
      jest
        .spyOn(service, 'subscribe')
        .mockRejectedValue(new Error('Invalid card details, card was declined'));

      await expect(controller.subscribe(mockRequest, subscribeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return specific error format for payment failures', async () => {
      jest
        .spyOn(service, 'subscribe')
        .mockRejectedValue(new Error('Invalid card details, card was declined'));

      try {
        await controller.subscribe(mockRequest, subscribeDto);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
      }
    });

    it('should support monthly billing cycle', async () => {
      jest
        .spyOn(service, 'subscribe')
        .mockResolvedValue({ message: 'Subscription successful' });

      await controller.subscribe(mockRequest, {
        ...subscribeDto,
        billingCycle: 'monthly',
      });

      expect(service.subscribe).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          billingCycle: 'monthly',
        }),
      );
    });

    it('should support yearly billing cycle', async () => {
      jest
        .spyOn(service, 'subscribe')
        .mockResolvedValue({ message: 'Subscription successful' });

      await controller.subscribe(mockRequest, {
        ...subscribeDto,
        billingCycle: 'yearly',
      });

      expect(service.subscribe).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          billingCycle: 'yearly',
        }),
      );
    });

    it('should support trial days', async () => {
      jest
        .spyOn(service, 'subscribe')
        .mockResolvedValue({ message: 'Subscription successful' });

      await controller.subscribe(mockRequest, {
        ...subscribeDto,
        trialDays: 7,
      });

      expect(service.subscribe).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          trialDays: 7,
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────
  // POST /subscriptions/cancel
  // ───────────────────────────────────────────────────────────────
  describe('POST /subscriptions/cancel', () => {
    it('should cancel user subscription', async () => {
      jest.spyOn(service, 'cancelSubscription').mockResolvedValue({
        message: 'Subscription auto renwal cancelled successfully',
        expiresAt: new Date('2024-02-01'),
      });

      const result = await controller.cancelSubscription(mockRequest);

      expect(result.message).toBe('Subscription auto renwal cancelled successfully');
      expect(service.cancelSubscription).toHaveBeenCalledWith('user-123');
    });

    it('should return expiration date in response', async () => {
      const expiresAt = new Date('2024-02-01');
      jest.spyOn(service, 'cancelSubscription').mockResolvedValue({
        message: 'Subscription auto renwal cancelled successfully',
        expiresAt,
      });

      const result = await controller.cancelSubscription(mockRequest);

      expect(result.expiresAt).toEqual(expiresAt);
    });

    it('should pass correct user ID to service', async () => {
      jest.spyOn(service, 'cancelSubscription').mockResolvedValue({
        message: 'Subscription auto renwal cancelled successfully',
        expiresAt: new Date(),
      });

      await controller.cancelSubscription(mockRequest);

      expect(service.cancelSubscription).toHaveBeenCalledWith('user-123');
    });

    it('should handle not found error', async () => {
      jest
        .spyOn(service, 'cancelSubscription')
        .mockRejectedValue(new Error('No active subscription found to cancel'));

      await expect(controller.cancelSubscription(mockRequest)).rejects.toThrow(Error);
    });
  });
});
