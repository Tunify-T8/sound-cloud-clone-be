import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  const userId = '84677602-3a5f-4da0-9b3a-af09bb74a145';

  // Check if the user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    console.error(`User with ID ${userId} not found!`);
    process.exit(1);
  }

  console.log('Found user:', user.id, '(' + user.username + ')');

  // Create a genre (tracks need a genre)
  const genre = await prisma.genre.upsert({
    where: { label: 'Electronic' },
    update: {},
    create: {
      label: 'Electronic',
    },
  });

  console.log('Created/found genre:', genre.id);

  // Create multiple tracks for the existing user
  const trackTitles = [
    { title: 'Midnight Vibes', description: 'A smooth electronic track for late night sessions' },
    { title: 'Electric Energy', description: 'High-energy electronic beats' },
    { title: 'Cosmic Journey', description: 'Ambient electronic soundscape' },
    { title: 'Pulse', description: 'Rhythmic and hypnotic electronic track' },
    { title: 'Neon Dreams', description: 'Synthwave-inspired electronic composition' },
  ];

  const createdTracks: Awaited<ReturnType<typeof prisma.track.create>>[] = [];
  for (const trackData of trackTitles) {
    const track = await prisma.track.create({
      data: {
        userId: userId,
        genreId: genre.id,
        title: trackData.title,
        description: trackData.description,
        audioUrl: `https://example.com/${trackData.title.toLowerCase().replace(/ /g, '-')}.mp3`,
        durationSeconds: Math.floor(Math.random() * 180) + 120,
        fileFormat: 'mp3',
        isPublic: true,
      },
    });
    createdTracks.push(track);
    console.log(`Created track: ${track.id} - "${track.title}" (${track.durationSeconds}s)`);
  }

  console.log(`\nSuccessfully created ${createdTracks.length} tracks for user ${userId}`);
  
  // Create all 3 subscription plans
  const subscriptionPlanConfigs = [
    {
      name: 'FREE',
      description: 'Free tier with basic features',
      monthlyPrice: 0,
      monthlyUploadMinutes: 100,
      maxTrackDurationMin: 30,
      allowedDownloads: 0,
      enableMonetization: false,
    },
    {
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
    {
      name: 'GOPLUS',
      description: 'Premium tier with all features',
      monthlyPrice: 19.99,
      monthlyUploadMinutes: null, // unlimited
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
  ];

  const createdPlans: Awaited<ReturnType<typeof prisma.subscriptionPlan.upsert>>[] = [];
  for (const planConfig of subscriptionPlanConfigs) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { name: planConfig.name },
      update: {},
      create: planConfig,
    });
    createdPlans.push(plan);
    console.log(`Created/found ${planConfig.name} plan:`, plan.id);
  }

  // Create subscriptions for the user
  const createdSubscriptions: Awaited<ReturnType<typeof prisma.subscription.create>>[] = [];
  for (const plan of createdPlans) {
    const subscription = await prisma.subscription.create({
      data: {
        userId: userId,
        planId: plan.id,
        status: 'active',
        billingCycle: 'monthly',
      },
    });
    createdSubscriptions.push(subscription);
    console.log(`Created ${plan.name} subscription:`, subscription.id);
  }

  console.log(`\nSuccessfully created ${createdSubscriptions.length} subscriptions for user ${userId}`);
  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
