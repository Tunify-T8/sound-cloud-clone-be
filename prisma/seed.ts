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
  
  // Upsert subscription plans
  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'PRO' },
    update: {},
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
    update: {},
    create: {
      name: 'GOPLUS',
      description: 'Premium tier with all features',
      monthlyPrice: 19.99,
      monthlyUploadMinutes: null,
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

  console.log('Created/found PRO plan:', proPlan.id);
  console.log('Created/found GOPLUS plan:', goPlusPlan.id);

  // Create PRO subscription for the first user
  const proSubscription = await prisma.subscription.create({
    data: {
      userId: userId,
      planId: proPlan.id,
      status: 'active',
      billingCycle: 'monthly',
    },
  });
  console.log(`Created PRO subscription for user ${userId}:`, proSubscription.id);

  // Create a second user with GOPLUS subscription
  const secondUserId = '94788713-4b6f-5eb1-0c4a-bg10cc85b256';
  
  // Check if second user exists, if not create them
  let secondUser = await prisma.user.findUnique({
    where: { id: secondUserId },
  });

  if (!secondUser) {
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
    console.log('Created second user:', secondUser.id, '(' + secondUser.username + ')');
  } else {
    console.log('Found second user:', secondUser.id, '(' + secondUser.username + ')');
  }

  // Create GOPLUS subscription for the second user
  const goPlusSubscription = await prisma.subscription.create({
    data: {
      userId: secondUserId,
      planId: goPlusPlan.id,
      status: 'active',
      billingCycle: 'monthly',
    },
  });
  console.log(`Created GOPLUS subscription for user ${secondUserId}:`, goPlusSubscription.id);

  console.log(`\nSuccessfully seeded database with subscriptions!`);
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
