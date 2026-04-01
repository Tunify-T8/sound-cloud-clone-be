export const usersIndexMapping = {
  settings: {
    analysis: {
      analyzer: {
        default: { type: 'standard' },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' },
      username: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      displayName: { type: 'text' },
      location: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      isCertified: { type: 'boolean' },
      followersCount: { type: 'integer' },
      role: { type: 'keyword' },
      createdAt: { type: 'date' },
    },
  },
};

export const tracksIndexMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      description: { type: 'text' },
      tags: { type: 'keyword' },
      genre: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      durationSeconds: { type: 'integer' },
      createdAt: { type: 'date' },
      allowDownloads: { type: 'boolean' },
      likesCount: { type: 'integer' },
      playsCount: { type: 'integer' },
      repostsCount: { type: 'integer' },
      artistId: { type: 'keyword' },
      artistUsername: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      artistDisplayName: { type: 'text' },
      artistIsCertified: { type: 'boolean' },
    },
  },
};

export const collectionsIndexMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      description: { type: 'text' },
      type: { type: 'keyword' },
      coverUrl: { type: 'keyword' },
      trackCount: { type: 'integer' },
      createdAt: { type: 'date' },
      artistId: { type: 'keyword' },
      artistUsername: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      artistDisplayName: { type: 'text' },
    },
  },
};
