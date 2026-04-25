export const usersIndexMapping = {
  settings: {
    analysis: {
      analyzer: {
        autocomplete_index: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'autocomplete_filter'],
        },
        autocomplete_search: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase'],
        },
      },
      filter: {
        autocomplete_filter: {
          type: 'edge_ngram',
          min_gram: 1,
          max_gram: 20,
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' },
      username: {
        type: 'text',
        analyzer: 'autocomplete_index',
        search_analyzer: 'autocomplete_search',
      },
      displayName: {
        type: 'text',
        analyzer: 'autocomplete_index',
        search_analyzer: 'autocomplete_search',
      },
      bio: { type: 'text' },
      location: { type: 'keyword' },
      isCertified: { type: 'boolean' },
      isSuspended: { type: 'boolean' },
      suspendedUntil: { type: 'date' },
      role: { type: 'keyword' },
      followersCount: { type: 'integer' },
      createdAt: { type: 'date' },
    },
  },
};

export const tracksIndexMapping = {
  settings: {
    analysis: {
      analyzer: {
        autocomplete_index: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'autocomplete_filter'],
        },
        autocomplete_search: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase'], // no ngram on search side
        },
      },
      filter: {
        autocomplete_filter: {
          type: 'edge_ngram',
          min_gram: 1, // matches from 1 character
          max_gram: 20,
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'autocomplete_index', // builds edge ngrams at index time
        search_analyzer: 'autocomplete_search', // plain match at search time
      },
      artistUsername: {
        type: 'text',
        analyzer: 'autocomplete_index',
        search_analyzer: 'autocomplete_search',
      },
      artistDisplayName: {
        type: 'text',
        analyzer: 'autocomplete_index',
        search_analyzer: 'autocomplete_search',
      },
      description: { type: 'text' },
      genre: { type: 'keyword' },
      tags: { type: 'keyword' },
      durationSeconds: { type: 'integer' },
      allowDownloads: { type: 'boolean' },
      createdAt: { type: 'date' },
      likesCount: { type: 'integer' },
      playsCount: { type: 'integer' },
      repostsCount: { type: 'integer' },
      coverUrl: { type: 'keyword', index: false },
      artistId: { type: 'keyword' },
      artistIsCertified: { type: 'boolean' },
    },
  },
};
export const collectionsIndexMapping = {
  settings: {
    analysis: {
      analyzer: {
        autocomplete_index: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'autocomplete_filter'],
        },
        autocomplete_search: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase'],
        },
      },
      filter: {
        autocomplete_filter: {
          type: 'edge_ngram',
          min_gram: 1,
          max_gram: 20,
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'autocomplete_index',
        search_analyzer: 'autocomplete_search',
      },
      description: { type: 'text' },
      type: { type: 'keyword' },
      coverUrl: { type: 'keyword', index: false },
      trackCount: { type: 'integer' },
      createdAt: { type: 'date' },
      artistId: { type: 'keyword' },
      artistUsername: {
        type: 'text',
        analyzer: 'autocomplete_index',
        search_analyzer: 'autocomplete_search',
      },
      artistDisplayName: {
        type: 'text',
        analyzer: 'autocomplete_index',
        search_analyzer: 'autocomplete_search',
      },
    },
  },
};
