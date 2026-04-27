import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum PaymentMethod {
  CARD = 'card',
  PAYPAL = 'paypal',
  APPLE = 'apple',
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum PlanName {
  ARTIST = 'artist',
  ARTIST_PRO = 'artist-pro',
}

export class CardDto {
  @IsString()
  last4!: string;

  @IsString()
  brand!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expiryMonth!: number;

  @IsInt()
  @Min(2024)
  expiryYear!: number;
}

export class SubscribeDto {
  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(PlanName)
  plan!: PlanName;

  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardDto)
  card?: CardDto;

  @IsInt()
  @Min(0)
  trialDays!: number;
}