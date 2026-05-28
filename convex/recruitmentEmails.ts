import { action } from './_generated/server';
import { v } from 'convex/values';
import { Resend } from 'resend';
import {
  applicationConfirmationTemplate,
  interviewInvitationTemplate,
  offerLetterTemplate,
  rejectionNoticeTemplate,
} from '../src/lib/recruitment-emails';
import { logger } from '@/lib/logger';

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.includes('your_api_key')) return null;
  return new Resend(key);
}

function shouldSendEmail(): boolean {
  const resendKey = process.env.RESEND_API_KEY;
  return !!resendKey && !resendKey.includes('your_api_key');
}

export const sendApplicationConfirmation = action({
  args: {
    candidateEmail: v.string(),
    candidateName: v.string(),
    vacancyTitle: v.string(),
    applicationDate: v.string(),
  },
  handler: async (ctx, args) => {
    if (!shouldSendEmail()) {
      logger.log('Resend not configured, skipping application confirmation email');
      return;
    }

    const resend = getResendClient();
    if (!resend) return;

    const { subject, html } = applicationConfirmationTemplate({
      recipientName: args.candidateName,
      vacancyTitle: args.vacancyTitle,
      applicationDate: args.applicationDate,
    });

    try {
      await resend.emails.send({
        from: 'HR Office <onboarding@resend.dev>',
        to: args.candidateEmail,
        subject,
        html,
      });
      logger.log(`Application confirmation sent to ${args.candidateEmail}`);
    } catch (error) {
      logger.error('Failed to send application confirmation:', error);
    }
  },
});

export const sendInterviewInvitation = action({
  args: {
    candidateEmail: v.string(),
    candidateName: v.string(),
    vacancyTitle: v.string(),
    interviewDate: v.string(),
    interviewTime: v.string(),
    interviewType: v.union(
      v.literal('phone'),
      v.literal('video'),
      v.literal('onsite'),
      v.literal('technical'),
      v.literal('hr'),
    ),
    interviewerName: v.string(),
    location: v.optional(v.string()),
    meetingLink: v.optional(v.string()),
    additionalNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!shouldSendEmail()) {
      logger.log('Resend not configured, skipping interview invitation email');
      return;
    }

    const resend = getResendClient();
    if (!resend) return;

    const { subject, html } = interviewInvitationTemplate({
      recipientName: args.candidateName,
      vacancyTitle: args.vacancyTitle,
      interviewDate: args.interviewDate,
      interviewTime: args.interviewTime,
      interviewType: args.interviewType,
      interviewerName: args.interviewerName,
      location: args.location,
      meetingLink: args.meetingLink,
      additionalNotes: args.additionalNotes,
    });

    try {
      await resend.emails.send({
        from: 'HR Office <onboarding@resend.dev>',
        to: args.candidateEmail,
        subject,
        html,
      });
      logger.log(`Interview invitation sent to ${args.candidateEmail}`);
    } catch (error) {
      logger.error('Failed to send interview invitation:', error);
    }
  },
});

export const sendOfferLetter = action({
  args: {
    candidateEmail: v.string(),
    candidateName: v.string(),
    vacancyTitle: v.string(),
    position: v.string(),
    department: v.string(),
    startDate: v.string(),
    salary: v.string(),
    offerExpiryDate: v.string(),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!shouldSendEmail()) {
      logger.log('Resend not configured, skipping offer letter email');
      return;
    }

    const resend = getResendClient();
    if (!resend) return;

    const { subject, html } = offerLetterTemplate({
      recipientName: args.candidateName,
      vacancyTitle: args.vacancyTitle,
      position: args.position,
      department: args.department,
      startDate: args.startDate,
      salary: args.salary,
      offerExpiryDate: args.offerExpiryDate,
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone,
    });

    try {
      await resend.emails.send({
        from: 'HR Office <onboarding@resend.dev>',
        to: args.candidateEmail,
        subject,
        html,
      });
      logger.log(`Offer letter sent to ${args.candidateEmail}`);
    } catch (error) {
      logger.error('Failed to send offer letter:', error);
    }
  },
});

export const sendRejectionNotice = action({
  args: {
    candidateEmail: v.string(),
    candidateName: v.string(),
    vacancyTitle: v.string(),
    rejectionDate: v.string(),
    feedback: v.optional(v.string()),
    encourageReapply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!shouldSendEmail()) {
      logger.log('Resend not configured, skipping rejection notice email');
      return;
    }

    const resend = getResendClient();
    if (!resend) return;

    const { subject, html } = rejectionNoticeTemplate({
      recipientName: args.candidateName,
      vacancyTitle: args.vacancyTitle,
      rejectionDate: args.rejectionDate,
      feedback: args.feedback,
      encourageReapply: args.encourageReapply,
    });

    try {
      await resend.emails.send({
        from: 'HR Office <onboarding@resend.dev>',
        to: args.candidateEmail,
        subject,
        html,
      });
      logger.log(`Rejection notice sent to ${args.candidateEmail}`);
    } catch (error) {
      logger.error('Failed to send rejection notice:', error);
    }
  },
});
