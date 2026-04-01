import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
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
  const userId = '2d566af9-38f1-42ee-8d83-53de7a97f240';
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    console.warn(
      `Test user ${userId} not found — skipping test tracks and subscriptions`,
    );
  } else {
    console.log('Found user:', user.id, '(' + user.username + ')');

    const electronicGenre = await prisma.genre.findUnique({
      where: { label: 'Electronic' },
    });

    if (electronicGenre) {
      const trackTitles = [
        {
          title: 'Midnight Vibes',
          description: 'A smooth electronic track for late night sessions',
        },
        {
          title: 'Electric Energy',
          description: 'High-energy electronic beats',
        },
        {
          title: 'Cosmic Journey',
          description: 'Ambient electronic soundscape',
        },
        {
          title: 'Pulse',
          description: 'Rhythmic and hypnotic electronic track',
        },
        {
          title: 'Neon Dreams',
          description: 'Synthwave-inspired electronic composition',
        },
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
      console.warn(
        'Could not create second user — may already exist with different ID, skipping',
      );
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

  // ── 5. Feed seed — follows, tracks, reposts, likes, plays ────
  if (user && secondUser) {
    // mainUser follows secondUser
    const existingFollow = await prisma.follow.findFirst({
      where: { followerId: userId, followingId: secondUserId },
    });

    if (!existingFollow) {
      await prisma.follow.create({
        data: { followerId: userId, followingId: secondUserId },
      });
      console.log('mainUser now follows secondUser');
    }

    const hipHopGenre = await prisma.genre.findUnique({
      where: { label: 'Hip-hop & Rap' },
    });

    // secondUser posts 3 tracks
    const feedTrackData = [
      { title: 'Feed Track Alpha', description: 'First feed test track' },
      { title: 'Feed Track Beta', description: 'Second feed test track' },
      {
        title: 'Feed Track Gamma',
        description: 'Third feed test track — no genre',
      },
    ];

    const feedTracks: Prisma.TrackGetPayload<true>[] = [];
    for (const data of feedTrackData) {
      const existing = await prisma.track.findFirst({
        where: { userId: secondUserId, title: data.title },
      });

      if (existing) {
        feedTracks.push(existing);
      } else {
        const track = await prisma.track.create({
          data: {
            userId: secondUserId,
            genreId:
              data.title === 'Feed Track Gamma' ? undefined : hipHopGenre?.id,
            title: data.title,
            description: data.description,
            audioUrl: `https://example.com/${data.title.toLowerCase().replace(/ /g, '-')}.mp3`,
            waveformUrl: `https://example.com/${data.title.toLowerCase().replace(/ /g, '-')}-waveform.png`,
            coverUrl: `https://example.com/${data.title.toLowerCase().replace(/ /g, '-')}-cover.jpg`,
            durationSeconds: Math.floor(Math.random() * 180) + 120,
            fileFormat: 'mp3',
            isPublic: true,
          },
        });
        feedTracks.push(track);
        console.log(`Created feed track: "${track.title}"`);
      }
    }

    // secondUser reposts one of mainUser's existing tracks
    const mainUserTrack = await prisma.track.findFirst({
      where: { userId, isPublic: true, isDeleted: false },
    });

    if (mainUserTrack) {
      const existingRepost = await prisma.repost.findFirst({
        where: { userId: secondUserId, trackId: mainUserTrack.id },
      });

      if (!existingRepost) {
        await prisma.repost.create({
          data: { userId: secondUserId, trackId: mainUserTrack.id },
        });
        console.log(
          `secondUser reposted: "${mainUserTrack.title}" — should appear in feed`,
        );
      }
    }

    // mainUser likes feedTracks[0] — isLiked should be true
    if (feedTracks[0]) {
      const existingLike = await prisma.trackLike.findFirst({
        where: { userId, trackId: feedTracks[0].id },
      });

      if (!existingLike) {
        await prisma.trackLike.create({
          data: { userId, trackId: feedTracks[0].id },
        });
        console.log(
          `mainUser liked: "${feedTracks[0].title}" — isLiked should be true`,
        );
      }
    }

    // mainUser reposted feedTracks[1] — isReposted should be true
    if (feedTracks[1]) {
      const existingRepost = await prisma.repost.findFirst({
        where: { userId, trackId: feedTracks[1].id },
      });

      if (!existingRepost) {
        await prisma.repost.create({
          data: { userId, trackId: feedTracks[1].id },
        });
        console.log(
          `mainUser reposted: "${feedTracks[1].title}" — isReposted should be true`,
        );
      }
    }

    // play history — gives numberOfListens > 0
    if (feedTracks[0]) {
      await prisma.playHistory.createMany({
        data: [
          { userId, trackId: feedTracks[0].id },
          { userId: secondUserId, trackId: feedTracks[0].id },
        ],
        skipDuplicates: true,
      });
      console.log(
        `Added 2 plays for: "${feedTracks[0].title}" — numberOfListens should be 2`,
      );
    }
    // ── 6. Search seed — third artist, collections, extra tracks ──
    const thirdUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    let thirdUser = await prisma.user.findUnique({
      where: { id: thirdUserId },
    });

    if (!thirdUser) {
      try {
        const hashedPassword = await bcrypt.hash('Artist123!', 10);
        thirdUser = await prisma.user.create({
          data: {
            id: thirdUserId,
            username: 'jazz_artist',
            email: 'jazz@soundcloud-clone.com',
            loginMethod: 'LOCAL',
            role: 'ARTIST',
            gender: 'PREFER_NOT_TO_SAY',
            dateOfBirth: new Date('1988-03-22'),
            passHash: hashedPassword,
            displayName: 'Jazz Artist',
            bio: 'Jazz and blues musician from New Orleans',
            location: 'New Orleans',
          },
        });
        console.log('Created third user:', thirdUser.username);
      } catch {
        console.warn('Could not create third user — skipping');
      }
    } else {
      console.log('Found third user:', thirdUser.username);
    }

    if (thirdUser) {
      const jazzGenre = await prisma.genre.findUnique({
        where: { label: 'Jazz & Blues' },
      });
      const popGenre = await prisma.genre.findUnique({
        where: { label: 'Pop' },
      });
      const rockGenre = await prisma.genre.findUnique({
        where: { label: 'Rock' },
      });

      // extra tracks by thirdUser for search testing
      const searchTrackData = [
        {
          title: 'Blue Note Sessions',
          description: 'Late night jazz improvisation',
          genreId: jazzGenre?.id,
          tags: ['jazz', 'blues', 'instrumental'],
        },
        {
          title: 'Midnight Blues',
          description: 'Soulful blues track with guitar',
          genreId: jazzGenre?.id,
          tags: ['blues', 'guitar', 'soul'],
        },
        {
          title: 'Summer Pop Anthem',
          description: 'Upbeat pop song for the summer',
          genreId: popGenre?.id,
          tags: ['pop', 'summer', 'upbeat'],
        },
        {
          title: 'Rock Revolution',
          description: 'Heavy rock with electric guitar riffs',
          genreId: rockGenre?.id,
          tags: ['rock', 'guitar', 'heavy'],
        },
      ];

      const searchTracks: Awaited<ReturnType<typeof prisma.track.findFirst>>[] =
        [];
      for (const data of searchTrackData) {
        const existing = await prisma.track.findFirst({
          where: { userId: thirdUserId, title: data.title },
        });

        if (existing) {
          searchTracks.push(existing);
        } else {
          const track = await prisma.track.create({
            data: {
              userId: thirdUserId,
              genreId: data.genreId,
              title: data.title,
              description: data.description,
              audioUrl: `https://example.com/${data.title.toLowerCase().replace(/ /g, '-')}.mp3`,
              waveformUrl: `https://example.com/${data.title.toLowerCase().replace(/ /g, '-')}-waveform.png`,
              coverUrl: `https://example.com/${data.title.toLowerCase().replace(/ /g, '-')}-cover.jpg`,
              durationSeconds: Math.floor(Math.random() * 300) + 60,
              fileFormat: 'mp3',
              isPublic: true,
              allowDownloads: true,
              tags: {
                create: data.tags.map((tag) => ({ tag })),
              },
            },
          });
          searchTracks.push(track);
          console.log(`Created search track: "${track.title}"`);
        }
      }

      // also add tags to secondUser's existing feed tracks for tag search testing
      const feedTrackAlpha = await prisma.track.findFirst({
        where: { userId: secondUserId, title: 'Feed Track Alpha' },
      });
      if (feedTrackAlpha) {
        const existingTag = await prisma.trackTag.findFirst({
          where: { trackId: feedTrackAlpha.id, tag: 'hiphop' },
        });
        if (!existingTag) {
          await prisma.trackTag.createMany({
            data: [
              { trackId: feedTrackAlpha.id, tag: 'hiphop' },
              { trackId: feedTrackAlpha.id, tag: 'rap' },
            ],
            skipDuplicates: true,
          });
          console.log('Added tags to Feed Track Alpha');
        }
      }

      // ── Album by thirdUser ──────────────────────────────────────
      const existingAlbum = await prisma.collection.findFirst({
        where: { userId: thirdUserId, title: 'Blue Note Collection' },
      });

      let album = existingAlbum;
      if (!album) {
        album = await prisma.collection.create({
          data: {
            userId: thirdUserId,
            title: 'Blue Note Collection',
            description: 'A collection of jazz and blues tracks',
            coverUrl: 'https://example.com/blue-note-cover.jpg',
            type: 'ALBUM',
            isPublic: true,
          },
        });
        console.log(`Created album: "${album.title}"`);
      }

      // add tracks to album
      if (searchTracks.length >= 2) {
        for (let i = 0; i < 2; i++) {
          const track = searchTracks[i];
          if (!track) continue;
          const existing = await prisma.collectionTrack.findFirst({
            where: { collectionId: album.id, trackId: track.id },
          });
          if (!existing) {
            await prisma.collectionTrack.create({
              data: {
                collectionId: album.id,
                trackId: track.id,
                position: i + 1,
              },
            });
          }
        }
        console.log(`Added tracks to album: "${album.title}"`);
      }

      // ── Playlist by mainUser ────────────────────────────────────
      if (user) {
        const existingPlaylist = await prisma.collection.findFirst({
          where: { userId, title: 'My Favorites Playlist' },
        });

        let playlist = existingPlaylist;
        if (!playlist) {
          playlist = await prisma.collection.create({
            data: {
              userId,
              title: 'My Favorites Playlist',
              description: 'A mix of my favorite tracks',
              coverUrl: 'https://example.com/playlist-cover.jpg',
              type: 'PLAYLIST',
              isPublic: true,
            },
          });
          console.log(`Created playlist: "${playlist.title}"`);
        }

        // add a mix of tracks from different users to the playlist
        const playlistTracks = [
          ...(searchTracks.length > 0 ? [searchTracks[0]] : []),
          ...(searchTracks.length > 2 ? [searchTracks[2]] : []),
        ];

        for (let i = 0; i < playlistTracks.length; i++) {
          const track = playlistTracks[i];
          if (!track) continue;

          const existing = await prisma.collectionTrack.findFirst({
            where: { collectionId: playlist.id, trackId: track.id },
          });
          if (!existing) {
            await prisma.collectionTrack.create({
              data: {
                collectionId: playlist.id,
                trackId: track.id,
                position: i + 1,
              },
            });
          }
        }
        console.log(`Added tracks to playlist: "${playlist.title}"`);
      }

      // ── Second album by secondUser ──────────────────────────────
      if (secondUser) {
        const existingAlbum2 = await prisma.collection.findFirst({
          where: { userId: secondUserId, title: 'Hip Hop Anthology' },
        });

        let album2 = existingAlbum2;
        if (!album2) {
          album2 = await prisma.collection.create({
            data: {
              userId: secondUserId,
              title: 'Hip Hop Anthology',
              description: 'The best hip hop tracks compiled',
              coverUrl: 'https://example.com/hiphop-anthology-cover.jpg',
              type: 'ALBUM',
              isPublic: true,
            },
          });
          console.log(`Created album: "${album2.title}"`);
        }

        const feedTrackBeta = await prisma.track.findFirst({
          where: { userId: secondUserId, title: 'Feed Track Beta' },
        });
        const feedTrackGamma = await prisma.track.findFirst({
          where: { userId: secondUserId, title: 'Feed Track Gamma' },
        });

        const album2Tracks = [feedTrackBeta, feedTrackGamma].filter(Boolean);
        for (let i = 0; i < album2Tracks.length; i++) {
          const t = album2Tracks[i];
          if (!t) continue;
          const existing = await prisma.collectionTrack.findFirst({
            where: { collectionId: album2.id, trackId: t.id },
          });
          if (!existing) {
            await prisma.collectionTrack.create({
              data: { collectionId: album2.id, trackId: t.id, position: i + 1 },
            });
          }
        }
        console.log(`Added tracks to album: "${album2.title}"`);
      }

      console.log('\nSearch seed complete.');
    }

    console.log('\nFeed seed complete. Test with GET /feed/me as mainUser.');
    console.log('Expected feed items: 3 posts + 1 repost by secondUser');
    console.log(`feedTracks[0] → isLiked: true, numberOfListens: 2`);
    console.log(`feedTracks[1] → isReposted: true`);
    console.log(`mainUserTrack repost → action: 'repost', actor: secondUser`);
  } else {
    console.warn('Skipping feed seed — one or both test users not found');
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
