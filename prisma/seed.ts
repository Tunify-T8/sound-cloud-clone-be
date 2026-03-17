import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  // Create a user first (tracks need a user)
  const user = await prisma.user.upsert({
    where: { email: 'artist@soundcloud.com' },
    update: {},
    create: {
      username: 'artist',
      email: 'artist@soundcloud.com',
      display_name: 'Artist User',
      login_method: 'LOCAL',
      role: 'ARTIST',
      is_verified: true,
      gender: 'OTHER',
      date_of_birth: new Date('1990-01-01'),
    },
  });

  console.log('Created user:', user.id);

  // Create a genre (tracks need a genre)
  const genre = await prisma.genre.upsert({
    where: { label: 'Electronic' },
    update: {},
    create: {
      label: 'Electronic',
    },
  });

  console.log('Created genre:', genre.id);

  // Create a track with ID "1"
  const track = await prisma.track.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      userId: user.id,
      genreId: genre.id,
      title: 'Test Track',
      description: 'This is a test track',
      audioUrl: 'https://example.com/audio.mp3',
      durationSeconds: 180,
      fileFormat: 'mp3',
      isPublic: true,
    },
  });

  console.log('Created track:', track.id);

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
