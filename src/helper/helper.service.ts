import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class HelperService {
  constructor(private readonly prisma: PrismaService) {}

  async getTracks(){
    return await this.prisma.track.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        isHidden: true,
      },
    });
  }
}
