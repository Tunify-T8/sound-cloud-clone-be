import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  const userId = '0d346be6-b321-4bab-af7e-97e1cf27096e';

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
  
  // Create all 3 subscriptions for the user
  const subscriptionPlans = ['FREE', 'PRO', 'GOPLUS'] as const;
  const createdSubscriptions: Awaited<ReturnType<typeof prisma.subscription.create>>[] = [];

  for (const planType of subscriptionPlans) {
    const subscription = await prisma.subscription.create({
      data: {
        userId: userId,
        planType: planType,
      },
    });
    createdSubscriptions.push(subscription);
    console.log(`Created ${planType} subscription:`, subscription.id);
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
