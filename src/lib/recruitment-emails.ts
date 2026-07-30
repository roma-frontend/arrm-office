interface EmailTemplateArgs {
  recipientName: string;
  companyName?: string;
  accentColor?: string;
}

interface ApplicationConfirmationArgs extends EmailTemplateArgs {
  vacancyTitle: string;
  applicationDate: string;
  portalUrl?: string;
}

interface InterviewInvitationArgs extends EmailTemplateArgs {
  vacancyTitle: string;
  interviewDate: string;
  interviewTime: string;
  interviewType: 'phone' | 'video' | 'onsite' | 'technical' | 'hr';
  location?: string;
  interviewerName: string;
  meetingLink?: string;
  additionalNotes?: string;
}

interface OfferLetterArgs extends EmailTemplateArgs {
  vacancyTitle: string;
  position: string;
  department: string;
  startDate: string;
  salary: string;
  offerExpiryDate: string;
  contactEmail: string;
  contactPhone?: string;
}

interface RejectionNoticeArgs extends EmailTemplateArgs {
  vacancyTitle: string;
  rejectionDate: string;
  feedback?: string;
  encourageReapply?: boolean;
}

function getCompanyName(): string {
  return process.env.NEXT_PUBLIC_COMPANY_NAME || 'Strata';
}

function getAccentColor(): string {
  return '#2563eb';
}

function baseTemplate(args: EmailTemplateArgs & { subject: string; content: string }): string {
  const companyName = args.companyName || getCompanyName();
  const accentColor = args.accentColor || getAccentColor();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${args.subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b;">
      <div style="max-width: 560px; margin: 0 auto;">
        <!-- Logo -->
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-flex; align-items: center; gap: 10px; background: linear-gradient(135deg, ${accentColor}, #0ea5e9); padding: 12px 20px; border-radius: 12px;">
            <span style="color: white; font-weight: 700; font-size: 18px;">🏢 ${companyName}</span>
          </div>
        </div>

        <!-- Card -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px 36px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          ${args.content}
        </div>

        <!-- Footer -->
        <p style="text-align: center; color: #64748b; font-size: 12px; margin-top: 24px;">
          © ${new Date().getFullYear()} ${companyName} • HR Management System<br>
          <span style="color: #94a3b8;">This is an automated message, please do not reply directly to this email.</span>
        </p>
      </div>
    </body>
    </html>
  `;
}

export function applicationConfirmationTemplate(args: ApplicationConfirmationArgs): {
  subject: string;
  html: string;
} {
  const companyName = args.companyName || getCompanyName();
  const accentColor = args.accentColor || getAccentColor();
  const subject = `Application Received — ${args.vacancyTitle}`;

  const content = `
    <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Application Confirmed</h1>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px; line-height: 1.6;">
      Hi ${args.recipientName},<br><br>
      Thank you for applying to <strong>${args.vacancyTitle}</strong> at ${companyName}.
      We have successfully received your application submitted on <strong>${args.applicationDate}</strong>.
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="color: #166534; font-size: 14px; margin: 0; line-height: 1.5;">
        ✅ <strong>Application Status:</strong> Under Review<br>
        Our hiring team will review your profile and get back to you within 5-7 business days.
      </p>
    </div>

    <h2 style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 12px;">What happens next?</h2>
    <ul style="color: #475569; font-size: 14px; margin: 0 0 24px; padding-left: 20px; line-height: 1.8;">
      <li>Our team reviews your application and resume</li>
      <li>If there's a match, we'll contact you for a screening call</li>
      <li>You may be invited for one or more interview rounds</li>
      <li>Final decision and offer (if selected)</li>
    </ul>

    ${
      args.portalUrl
        ? `
      <a href="${args.portalUrl}" style="display: block; text-align: center; background: linear-gradient(135deg, ${accentColor}, #0ea5e9); color: white; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin-bottom: 16px;">
        Track Your Application →
      </a>
    `
        : ''
    }

    <p style="color: #64748b; font-size: 13px; margin: 0; line-height: 1.6;">
      If you have any questions, feel free to contact our HR team.
    </p>
  `;

  return { subject, html: baseTemplate({ ...args, subject, content }) };
}

export function interviewInvitationTemplate(args: InterviewInvitationArgs): {
  subject: string;
  html: string;
} {
  const companyName = args.companyName || getCompanyName();
  const accentColor = args.accentColor || getAccentColor();
  const subject = `Interview Invitation — ${args.vacancyTitle}`;

  const typeLabels: Record<string, string> = {
    phone: '📞 Phone Interview',
    video: '💻 Video Interview',
    onsite: '🏢 On-site Interview',
    technical: '⚙️ Technical Assessment',
    hr: '👤 HR Screening',
  };

  const content = `
    <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 8px;">You're Invited to an Interview</h1>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px; line-height: 1.6;">
      Hi ${args.recipientName},<br><br>
      We were impressed by your application for <strong>${args.vacancyTitle}</strong> and would like to invite you to an interview.
    </p>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #1e40af; font-weight: 600; width: 120px;">📋 Type:</td>
          <td style="padding: 6px 0; color: #1e293b;">${typeLabels[args.interviewType] || args.interviewType}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #1e40af; font-weight: 600;">📅 Date:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.interviewDate}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #1e40af; font-weight: 600;">🕐 Time:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.interviewTime}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #1e40af; font-weight: 600;">👤 Interviewer:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.interviewerName}</td>
        </tr>
        ${
          args.location
            ? `
        <tr>
          <td style="padding: 6px 0; color: #1e40af; font-weight: 600;">📍 Location:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.location}</td>
        </tr>
        `
            : ''
        }
      </table>
    </div>

    ${
      args.meetingLink
        ? `
      <a href="${args.meetingLink}" style="display: block; text-align: center; background: linear-gradient135deg, ${accentColor}, #0ea5e9); color: white; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; margin-bottom: 16px;">
        Join Meeting →
      </a>
    `
        : ''
    }

    ${
      args.additionalNotes
        ? `
      <h2 style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 8px;">Additional Notes</h2>
      <p style="color: #475569; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
        ${args.additionalNotes}
      </p>
    `
        : ''
    }

    <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
      <p style="color: #854d0e; font-size: 13px; margin: 0; line-height: 1.5;">
        💡 <strong>Tip:</strong> Please arrive 5-10 minutes early. If you need to reschedule, contact us at least 24 hours in advance.
      </p>
    </div>

    <p style="color: #64748b; font-size: 13px; margin: 0; line-height: 1.6;">
      We look forward to speaking with you!<br>
      Best regards,<br>
      <strong>${companyName} Hiring Team</strong>
    </p>
  `;

  return { subject, html: baseTemplate({ ...args, subject, content }) };
}

export function offerLetterTemplate(args: OfferLetterArgs): { subject: string; html: string } {
  const companyName = args.companyName || getCompanyName();
  const subject = `Job Offer — ${args.position} at ${companyName}`;

  const content = `
    <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 8px;">🎉 Congratulations!</h1>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px; line-height: 1.6;">
      Hi ${args.recipientName},<br><br>
      We are pleased to offer you the position of <strong>${args.position}</strong> in our <strong>${args.department}</strong> department at ${companyName}.
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #166534; font-weight: 600; width: 140px;">💼 Position:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.position}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #166534; font-weight: 600;">🏢 Department:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.department}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #166534; font-weight: 600;">📅 Start Date:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.startDate}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #166534; font-weight: 600;">💰 Salary:</td>
          <td style="padding: 6px 0; color: #1e293b;">${args.salary}</td>
        </tr>
      </table>
    </div>

    <h2 style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 12px;">Offer Details</h2>
    <ul style="color: #475569; font-size: 14px; margin: 0 0 24px; padding-left: 20px; line-height: 1.8;">
      <li>This offer is contingent upon successful completion of background verification</li>
      <li>Please review and respond to this offer by <strong>${args.offerExpiryDate}</strong></li>
      <li>Benefits package details will be shared during onboarding</li>
    </ul>

    <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
      <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
        ⏳ <strong>Action Required:</strong> Please respond to this offer before ${args.offerExpiryDate}. If you have any questions, contact us at <a href="mailto:${args.contactEmail}" style="color: #2563eb;">${args.contactEmail}</a>${args.contactPhone ? ` or call ${args.contactPhone}` : ''}.
      </p>
    </div>

    <p style="color: #64748b; font-size: 13px; margin: 0; line-height: 1.6;">
      We are excited about the possibility of you joining our team!<br>
      Warm regards,<br>
      <strong>${companyName} HR Department</strong>
    </p>
  `;

  return { subject, html: baseTemplate({ ...args, subject, content }) };
}

export function rejectionNoticeTemplate(args: RejectionNoticeArgs): {
  subject: string;
  html: string;
} {
  const companyName = args.companyName || getCompanyName();
  const subject = `Application Update — ${args.vacancyTitle}`;

  const content = `
    <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Application Status Update</h1>
    <p style="color: #475569; font-size: 15px; margin: 0 0 24px; line-height: 1.6;">
      Hi ${args.recipientName},<br><br>
      Thank you for your interest in the <strong>${args.vacancyTitle}</strong> position at ${companyName} and for taking the time to apply.
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="color: #991b1b; font-size: 14px; margin: 0; line-height: 1.5;">
        After careful consideration, we have decided to move forward with other candidates whose experience more closely aligns with our current needs.
      </p>
      <p style="color: #991b1b; font-size: 13px; margin: 8px 0 0; line-height: 1.5;">
        Decision date: <strong>${args.rejectionDate}</strong>
      </p>
    </div>

    ${
      args.feedback
        ? `
      <h2 style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 8px;">Feedback</h2>
      <p style="color: #475569; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
        ${args.feedback}
      </p>
    `
        : ''
    }

    ${
      args.encourageReapply
        ? `
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
        <p style="color: #1e40af; font-size: 13px; margin: 0; line-height: 1.5;">
          💡 <strong>We'd love to stay in touch!</strong> Please feel free to apply for future openings that match your skills and experience. We encourage you to check our careers page regularly.
        </p>
      </div>
    `
        : ''
    }

    <p style="color: #64748b; font-size: 13px; margin: 0 0 16px; line-height: 1.6;">
      We appreciate your interest in ${companyName} and wish you the best in your job search.
    </p>

    <p style="color: #64748b; font-size: 13px; margin: 0; line-height: 1.6;">
      Best regards,<br>
      <strong>${companyName} Hiring Team</strong>
    </p>
  `;

  return { subject, html: baseTemplate({ ...args, subject, content }) };
}

export type {
  ApplicationConfirmationArgs,
  InterviewInvitationArgs,
  OfferLetterArgs,
  RejectionNoticeArgs,
};
