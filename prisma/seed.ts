import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  // ── 1. Genres — always safe, uses upsert ──────────────────────
  const genres = [
    { label: 'Alternative Rock' },
    { label: 'Ambient' },
    { label: 'Classical' },
    { label: 'Country' },
    { label: 'Dance & EDM' },
    { label: 'Dancehall' },
    { label: 'Deep House' },
    { label: 'Disco' },
    { label: 'Drum & Bass' },
    { label: 'Dubstep' },
    { label: 'Electronic' },
    { label: 'Folk & Singer-Songwriter' },
    { label: 'Hip-hop & Rap' },
    { label: 'House' },
    { label: 'Indie' },
    { label: 'Jazz & Blues' },
    { label: 'Latin' },
    { label: 'Metal' },
    { label: 'Piano' },
    { label: 'Pop' },
    { label: 'R&B & Soul' },
    { label: 'Reggae' },
    { label: 'Reggaeton' },
    { label: 'Rock' },
    { label: 'Soundtrack' },
    { label: 'Speech' },
    { label: 'Techno' },
    { label: 'Trance' },
    { label: 'Trap' },
    { label: 'Triphop' },
    { label: 'World' },
    { label: 'Audiobooks' },
    { label: 'Business' },
    { label: 'Comedy' },
    { label: 'Entertainment' },
    { label: 'Learning' },
    { label: 'News & Politics' },
    { label: 'Religion & Spirituality' },
    { label: 'Science' },
    { label: 'Sports' },
    { label: 'Storytelling' },
    { label: 'Technology' },
  ];

  for (const genre of genres) {
    await prisma.genre.upsert({
      where: { label: genre.label },
      update: {},
      create: { label: genre.label },
    });
  }
  console.log(`Seeded ${genres.length} genres`);

  // ── 2. Subscription plans — always safe, uses upsert ─────────
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'FREE' },
    update: {
      description: 'Free tier',
      monthlyPrice: 0,
      monthlyUploadMinutes: 180,
      maxTrackDurationMin: 180,
      allowedDownloads: 0,
      enableMonetization: false,
      allowDirectDownload: false,
      allowOfflineListening: false,
      adFree: false,
      analytics: false,
      advancedAnalytics: false,
      releaseScheduling: false,
      prioritySupport: false,
    },
    create: {
      name: 'FREE',
      description: 'Free tier',
      monthlyPrice: 0,
      monthlyUploadMinutes: 180,
      maxTrackDurationMin: 180,
      allowedDownloads: 0,
      enableMonetization: false,
      allowDirectDownload: false,
      allowOfflineListening: false,
      adFree: false,
      analytics: false,
      advancedAnalytics: false,
      releaseScheduling: false,
      prioritySupport: false,
    },
  });

  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'PRO' },
    update: {
      description: 'Professional tier with advanced features',
      monthlyPrice: 9.99,
      monthlyUploadMinutes: 5000,
      maxTrackDurationMin: 180,
      allowedDownloads: -1,
      enableMonetization: true,
      allowDirectDownload: true,
      allowOfflineListening: true,
      adFree: true,
      analytics: true,
      advancedAnalytics: false,
      releaseScheduling: true,
      prioritySupport: false,
    },
    create: {
      name: 'PRO',
      description: 'Professional tier with advanced features',
      monthlyPrice: 9.99,
      monthlyUploadMinutes: 5000,
      maxTrackDurationMin: 180,
      allowedDownloads: -1,
      enableMonetization: true,
      allowDirectDownload: true,
      allowOfflineListening: true,
      adFree: true,
      analytics: true,
      releaseScheduling: true,
    },
  });

  const goPlusPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'GOPLUS' },
    update: {
      description: 'Premium tier with all features',
      monthlyPrice: 19.99,
      monthlyUploadMinutes: 10000000,
      maxTrackDurationMin: 180,
      allowedDownloads: -1,
      enableMonetization: true,
      allowDirectDownload: true,
      allowOfflineListening: true,
      adFree: true,
      analytics: true,
      advancedAnalytics: true,
      releaseScheduling: true,
      prioritySupport: true,
    },
    create: {
      name: 'GOPLUS',
      description: 'Premium tier with all features',
      monthlyPrice: 19.99,
      monthlyUploadMinutes: 10000000,
      maxTrackDurationMin: 180,
      allowedDownloads: -1,
      enableMonetization: true,
      allowDirectDownload: true,
      allowOfflineListening: true,
      adFree: true,
      analytics: true,
      advancedAnalytics: true,
      releaseScheduling: true,
      prioritySupport: true,
    },
  });

  console.log('Created/found FREE plan:', freePlan.id);
  console.log('Created/found PRO plan:', proPlan.id);
  console.log('Created/found GOPLUS plan:', goPlusPlan.id);

  // ── 3. Test user and tracks — optional, skipped if user missing
  const userId = '84677602-3a5f-4da0-9b3a-af09bb74a145';
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    console.warn(`Test user ${userId} not found — skipping test tracks and subscriptions`);
  } else {
    console.log('Found user:', user.id, '(' + user.username + ')');

    const electronicGenre = await prisma.genre.findUnique({
      where: { label: 'Electronic' },
    });

    if (electronicGenre) {
      const trackTitles = [
        { title: 'Midnight Vibes', description: 'A smooth electronic track for late night sessions' },
        { title: 'Electric Energy', description: 'High-energy electronic beats' },
        { title: 'Cosmic Journey', description: 'Ambient electronic soundscape' },
        { title: 'Pulse', description: 'Rhythmic and hypnotic electronic track' },
        { title: 'Neon Dreams', description: 'Synthwave-inspired electronic composition' },
      ];

      let tracksCreated = 0;
      for (const trackData of trackTitles) {
        // check if track already exists to avoid duplicates on re-run
        const existing = await prisma.track.findFirst({
          where: { userId, title: trackData.title },
        });

        if (!existing) {
          const track = await prisma.track.create({
            data: {
              userId,
              genreId: electronicGenre.id,
              title: trackData.title,
              description: trackData.description,
              audioUrl: `https://example.com/${trackData.title.toLowerCase().replace(/ /g, '-')}.mp3`,
              durationSeconds: Math.floor(Math.random() * 180) + 120,
              fileFormat: 'mp3',
              isPublic: true,
            },
          });
          console.log(`Created track: "${track.title}"`);
          tracksCreated++;
        }
      }
      console.log(`Seeded ${tracksCreated} new test tracks`);
    }

    // create PRO subscription only if user doesn't already have one
    const existingProSub = await prisma.subscription.findFirst({
      where: { userId, planId: proPlan.id },
    });

    if (!existingProSub) {
      await prisma.subscription.create({
        data: {
          status: 'active',
          billingCycle: 'monthly',
          user: { connect: { id: userId } },
          plan: { connect: { id: proPlan.id } },
        },
      });
      console.log(`Created PRO subscription for user ${userId}`);
    }
  }

  // ── 4. Second test user — created if not exists ───────────────
  const secondUserId = '94788713-4b6f-5eb1-0c4a-bg10cc85b256';
  let secondUser = await prisma.user.findUnique({
    where: { id: secondUserId },
  });

  if (!secondUser) {
    try {
      const hashedPassword = await bcrypt.hash('PREM123', 10);
      secondUser = await prisma.user.create({
        data: {
          id: secondUserId,
          username: 'premium_artist',
          email: 'premium@soundcloud-clone.com',
          loginMethod: 'LOCAL',
          role: 'ARTIST',
          gender: 'PREFER_NOT_TO_SAY',
          dateOfBirth: new Date('1990-01-15'),
          passHash: hashedPassword,
        },
      });
      console.log('Created second user:', secondUser.username);
    } catch {
      console.warn('Could not create second user — may already exist with different ID, skipping');
    }
  } else {
    console.log('Found second user:', secondUser.username);
  }

  if (secondUser) {
    const existingGoPlusSub = await prisma.subscription.findFirst({
      where: { userId: secondUserId, planId: goPlusPlan.id },
    });

    if (!existingGoPlusSub) {
      await prisma.subscription.create({
        data: {
          status: 'active',
          billingCycle: 'monthly',
          user: { connect: { id: secondUserId } },
          plan: { connect: { id: goPlusPlan.id } },
        },
      });
      console.log(`Created GOPLUS subscription for second user`);
    }
  }

  console.log('\nDatabase seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });