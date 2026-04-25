import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';

interface IndexBody {
  settings?: Record<string, unknown>;
  mappings?: Record<string, unknown>;
}

interface SearchBody {
  query?: unknown;
  sort?: unknown;
  from?: number;
  size?: number;
}

@Injectable()
export class OpensearchService {
  private readonly logger = new Logger(OpensearchService.name);
  private readonly client: Client;

  constructor(private readonly configService: ConfigService) {
    this.client = new Client({
      node: this.configService.get<string>('OPENSEARCH_NODE'),
      //   auth: {
      //     username: this.configService.get<string>('OPENSEARCH_USERNAME') ?? '',
      //     password: this.configService.get<string>('OPENSEARCH_PASSWORD') ?? '',
      //   },
      //  ssl: { rejectUnauthorized: false },
    });
  }

  async indexExists(index: string): Promise<boolean> {
    const response = await this.client.indices.exists({ index });
    return response.body === true || response.statusCode === 200;
  }

  async createIndex(index: string, body: IndexBody): Promise<void> {
    await this.client.indices.create({
      index,
      body: {
        settings: body.settings,
        mappings: body.mappings,
      },
    });
    this.logger.log(`Created index: ${index}`);
  }

  async deleteIndex(index: string): Promise<void> {
    await this.client.indices.delete({ index });
  }

  async indexDocument(
    index: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await this.client.index({ index, id, body, refresh: true });
  }

  async deleteDocument(index: string, id: string): Promise<void> {
    await this.client.delete({ index, id, refresh: true });
  }

  async bulkIndex(operations: unknown[]): Promise<void> {
    await this.client.bulk({
      refresh: true,
      body: operations as unknown as Parameters<
        typeof this.client.bulk
      >[0]['body'],
    });
  }

  async search(index: string | string[], body: SearchBody): Promise<unknown> {
    const response = await this.client.search({
      index,
      body: body as unknown as Parameters<typeof this.client.search>[0]['body'],
    });
    return response.body;
  }
}
