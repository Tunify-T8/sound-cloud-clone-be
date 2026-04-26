-- =============================================================================
-- SEED: Admin User + Subscription Plans
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CREATE ADMIN USER
-- ---------------------------------------------------------------------------
INSERT INTO "User" (
  id, username, "displayName", email, "passHash",
  "loginMethod", role, bio, location,
  "avatarUrl", "isVerified", "isActive", "isCertified",
  visibility, gender, "dateOfBirth", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'jana_admin',
  'Jana Yehia',
  'jana7yehia@gmail.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
  'LOCAL', 'ADMIN',
  'Platform administrator.',
  NULL,
  'https://api.dicebear.com/7.x/avataaars/svg?seed=jana',
  true, true, false,
  'PUBLIC', 'FEMALE', '1990-01-01', NOW(), NOW()
)
ON CONFLICT (email) DO UPDATE
  SET "isVerified" = true,
      role = 'ADMIN',
      "updatedAt" = NOW();

-- ---------------------------------------------------------------------------
-- 2. CLEAR SUBSCRIPTION PLANS
-- ---------------------------------------------------------------------------
DELETE FROM "SubscriptionPlan";

-- ---------------------------------------------------------------------------
-- 3. INSERT SUBSCRIPTION PLANS
-- ---------------------------------------------------------------------------

-- FREE
INSERT INTO "SubscriptionPlan" (
  id, name, description,
  "monthlyPrice", "yearlyPrice",
  "monthlyUploadMinutes", "maxTrackDurationMin",
  "allowedDownloads",
  "enableMonetization",
  "allowDirectDownload", "allowOfflineListening",
  "adFree", analytics, "advancedAnalytics",
  "releaseScheduling", "prioritySupport",
  "playbackAccess", "playlistLimit",
  "isActive", "displayOrder",
  "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), 'free', 'Free tier',
  0, 0,
  180, 180,
  0,
  false,
  false, false,
  false, false, false,
  false, false,
  false, 3,
  true, 0,
  NOW(), NOW()
);

-- ARTIST
INSERT INTO "SubscriptionPlan" (
  id, name, description,
  "monthlyPrice", "yearlyPrice",
  "monthlyUploadMinutes", "maxTrackDurationMin",
  "allowedDownloads",
  "enableMonetization",
  "allowDirectDownload", "allowOfflineListening",
  "adFree", analytics, "advancedAnalytics",
  "releaseScheduling", "prioritySupport",
  "playbackAccess", "playlistLimit",
  "isActive", "displayOrder",
  "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), 'artist', 'Professional tier with advanced features',
  29.99, 359.88,
  180, 180,
  -1,
  true,
  true, true,
  true, false, false,
  true, false,
  false, -1,
  true, 1,
  NOW(), NOW()
);

-- ARTIST-PRO
INSERT INTO "SubscriptionPlan" (
  id, name, description,
  "monthlyPrice", "yearlyPrice",
  "monthlyUploadMinutes", "maxTrackDurationMin",
  "allowedDownloads",
  "enableMonetization",
  "allowDirectDownload", "allowOfflineListening",
  "adFree", analytics, "advancedAnalytics",
  "releaseScheduling", "prioritySupport",
  "playbackAccess", "playlistLimit",
  "isActive", "displayOrder",
  "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), 'artist-pro', 'Premium tier with all features',
  74.99, 899.88,
  -1, -1,
  -1,
  true,
  true, true,
  true, true, true,
  true, true,
  true, -1,
  true, 2,
  NOW(), NOW()
);

COMMIT;