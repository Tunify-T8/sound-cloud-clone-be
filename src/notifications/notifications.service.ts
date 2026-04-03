import { Injectable } from '@nestjs/common';
@Injectable()
export class NotificationsService {
  // ── Called when user A follows user B ──────────────────────
  // No-op until Module 10 is implemented.
  // When ready: create a user_followed notification for recipientId.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async notifyFollow(actorId: string, recipientId: string): Promise<void> {
    // TODO: implement when notifications module is ready
  }
}