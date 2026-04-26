import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  // ─── Core Send Method ───────────────────────────────────────────
  private async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Tunify" <${this.configService.get<string>('MAIL_USER')}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  // ─── Email Verification ──────────────────────────────────────────
  // ─── Email Verification ──────────────────────────────────────────
  async sendVerificationEmail(
    to: string,
    username: string,
    token: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f50;">Welcome to Tunify, ${username}!</h2>
        <p>Thanks for signing up. Please verify your email address using the token below.</p>
        <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="color: #333; letter-spacing: 4px;">${token}</h1>
        </div>
        <p>Copy this token and paste it in the verification page.</p>
        <p style="color: #999; font-size: 12px;">This token expires in 24 hours. If you didn't create an account, ignore this email.</p>
      </div>
    `;

    await this.sendMail({
      to,
      subject: 'Verify your email - Tunify',
      html,
    });
  }

  // ─── Password Reset ──────────────────────────────────────────────
  async sendPasswordResetEmail(
    to: string,
    username: string,
    token: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f50;">Password Reset Request</h2>
        <p>Hi ${username}, we received a request to reset your password.</p>
        <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="color: #333; letter-spacing: 4px;">${token}</h1>
        </div>
        <p>Copy this token and paste it in the password reset page.</p>
        <p style="color: #999; font-size: 12px;">This token expires in 3 hours. If you didn't request a password reset, ignore this email.</p>
      </div>
    `;

    await this.sendMail({
      to,
      subject: 'Reset your password - Tunify',
      html,
    });
  }

  // ─── Track Liked ─────────────────────────────────────────────────
  async sendTrackLikedEmail(
    to: string,
    recipientUsername: string,
    actorUsername: string,
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f50;">Someone liked your track!</h2>
      <p>Hi ${recipientUsername}, <strong>${actorUsername}</strong> liked your track on Tunify.</p>
      <p style="color: #999; font-size: 12px;">You can manage your notification preferences in your account settings.</p>
    </div>
  `;
    await this.sendMail({
      to,
      subject: `${actorUsername} liked your track - Tunify`,
      html,
    });
  }

  // ─── Track Commented ─────────────────────────────────────────────
  async sendTrackCommentedEmail(
    to: string,
    recipientUsername: string,
    actorUsername: string,
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f50;">New comment on your track!</h2>
      <p>Hi ${recipientUsername}, <strong>${actorUsername}</strong> commented on your track on Tunify.</p>
      <p style="color: #999; font-size: 12px;">You can manage your notification preferences in your account settings.</p>
    </div>
  `;
    await this.sendMail({
      to,
      subject: `${actorUsername} commented on your track - Tunify`,
      html,
    });
  }

  // ─── Track Reposted ──────────────────────────────────────────────
  async sendTrackRepostedEmail(
    to: string,
    recipientUsername: string,
    actorUsername: string,
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f50;">Someone reposted your track!</h2>
      <p>Hi ${recipientUsername}, <strong>${actorUsername}</strong> reposted your track on Tunify.</p>
      <p style="color: #999; font-size: 12px;">You can manage your notification preferences in your account settings.</p>
    </div>
  `;
    await this.sendMail({
      to,
      subject: `${actorUsername} reposted your track - Tunify`,
      html,
    });
  }

  // ─── User Followed ───────────────────────────────────────────────
  async sendUserFollowedEmail(
    to: string,
    recipientUsername: string,
    actorUsername: string,
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f50;">You have a new follower!</h2>
      <p>Hi ${recipientUsername}, <strong>${actorUsername}</strong> started following you on Tunify.</p>
      <p style="color: #999; font-size: 12px;">You can manage your notification preferences in your account settings.</p>
    </div>
  `;
    await this.sendMail({
      to,
      subject: `${actorUsername} followed you - Tunify`,
      html,
    });
  }

  // ─── New Message ─────────────────────────────────────────────────
  async sendNewMessageEmail(
    to: string,
    recipientUsername: string,
    actorUsername: string,
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f50;">You have a new message!</h2>
      <p>Hi ${recipientUsername}, <strong>${actorUsername}</strong> sent you a message on Tunify.</p>
      <p style="color: #999; font-size: 12px;">You can manage your notification preferences in your account settings.</p>
    </div>
  `;
    await this.sendMail({
      to,
      subject: `New message from ${actorUsername} - Tunify`,
      html,
    });
  }

  // ─── New Release ─────────────────────────────────────────────────
  async sendNewReleaseEmail(
    to: string,
    recipientUsername: string,
    actorUsername: string,
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f50;">New track release!</h2>
      <p>Hi ${recipientUsername}, <strong>${actorUsername}</strong> just released a new track on Tunify.</p>
      <p style="color: #999; font-size: 12px;">You can manage your notification preferences in your account settings.</p>
    </div>
  `;
    await this.sendMail({
      to,
      subject: `${actorUsername} released a new track - Tunify`,
      html,
    });
  }
}
