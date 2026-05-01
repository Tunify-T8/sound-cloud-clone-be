-- =============================================================================
-- FIX: Update Free Plan Monthly Upload Limit from 180 to 10 minutes
-- =============================================================================

BEGIN;

UPDATE "SubscriptionPlan"
SET "monthlyUploadMinutes" = 10,
    "updatedAt" = NOW()
WHERE name = 'free';

COMMIT;
