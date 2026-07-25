import {
  applicationConfirmationTemplate,
  interviewInvitationTemplate,
  offerLetterTemplate,
  rejectionNoticeTemplate,
} from '@/lib/recruitment-emails';

describe('applicationConfirmationTemplate', () => {
  const baseArgs = {
    recipientName: 'John Doe',
    vacancyTitle: 'Senior Developer',
    applicationDate: 'January 15, 2026',
  };

  it('returns correct subject', () => {
    const result = applicationConfirmationTemplate(baseArgs);
    expect(result.subject).toBe('Application Received — Senior Developer');
  });

  it('includes candidate name in HTML', () => {
    const result = applicationConfirmationTemplate(baseArgs);
    expect(result.html).toContain('Hi John Doe');
  });

  it('includes vacancy title in HTML', () => {
    const result = applicationConfirmationTemplate(baseArgs);
    expect(result.html).toContain('Senior Developer');
  });

  it('includes application date in HTML', () => {
    const result = applicationConfirmationTemplate(baseArgs);
    expect(result.html).toContain('January 15, 2026');
  });

  it('includes portal link when provided', () => {
    const result = applicationConfirmationTemplate({
      ...baseArgs,
      portalUrl: 'https://example.com/track',
    });
    expect(result.html).toContain('https://example.com/track');
    expect(result.html).toContain('Track Your Application');
  });

  it('does not include portal link when not provided', () => {
    const result = applicationConfirmationTemplate(baseArgs);
    expect(result.html).not.toContain('Track Your Application');
  });
});

describe('interviewInvitationTemplate', () => {
  const baseArgs = {
    recipientName: 'Jane Smith',
    vacancyTitle: 'Product Manager',
    interviewDate: 'February 1, 2026',
    interviewTime: '10:00 AM',
    interviewType: 'video' as const,
    interviewerName: 'Alice Johnson',
  };

  it('returns correct subject', () => {
    const result = interviewInvitationTemplate(baseArgs);
    expect(result.subject).toBe('Interview Invitation — Product Manager');
  });

  it('includes interview type label', () => {
    const result = interviewInvitationTemplate(baseArgs);
    expect(result.html).toContain('💻 Video Interview');
  });

  it('includes interview date and time', () => {
    const result = interviewInvitationTemplate(baseArgs);
    expect(result.html).toContain('February 1, 2026');
    expect(result.html).toContain('10:00 AM');
  });

  it('includes interviewer name', () => {
    const result = interviewInvitationTemplate(baseArgs);
    expect(result.html).toContain('Alice Johnson');
  });

  it('includes location when provided', () => {
    const result = interviewInvitationTemplate({
      ...baseArgs,
      interviewType: 'onsite',
      location: '123 Main St, Yerevan',
    });
    expect(result.html).toContain('123 Main St, Yerevan');
    expect(result.html).toContain('📍 Location:');
  });

  it('includes meeting link when provided', () => {
    const result = interviewInvitationTemplate({
      ...baseArgs,
      meetingLink: 'https://meet.google.com/abc-defg-hij',
    });
    expect(result.html).toContain('https://meet.google.com/abc-defg-hij');
    expect(result.html).toContain('Join Meeting');
  });

  it('includes additional notes when provided', () => {
    const result = interviewInvitationTemplate({
      ...baseArgs,
      additionalNotes: 'Please prepare a 10-minute presentation.',
    });
    expect(result.html).toContain('Please prepare a 10-minute presentation.');
  });

  it('handles all interview types', () => {
    const types: Array<'phone' | 'video' | 'onsite' | 'technical' | 'hr'> = [
      'phone',
      'video',
      'onsite',
      'technical',
      'hr',
    ];
    const labels = [
      '📞 Phone Interview',
      '💻 Video Interview',
      '🏢 On-site Interview',
      '⚙️ Technical Assessment',
      '👤 HR Screening',
    ];

    types.forEach((type, index) => {
      const result = interviewInvitationTemplate({ ...baseArgs, interviewType: type });
      expect(result.html).toContain(labels[index]);
    });
  });
});

describe('offerLetterTemplate', () => {
  const baseArgs = {
    recipientName: 'Bob Williams',
    vacancyTitle: 'Engineering Lead',
    position: 'Engineering Lead',
    department: 'Technology',
    startDate: 'March 1, 2026',
    salary: '$120,000/year',
    offerExpiryDate: 'February 15, 2026',
    contactEmail: 'hr@company.com',
  };

  it('returns correct subject', () => {
    const result = offerLetterTemplate(baseArgs);
    expect(result.subject).toBe('Job Offer — Engineering Lead at Strata');
  });

  it('includes congratulations message', () => {
    const result = offerLetterTemplate(baseArgs);
    expect(result.html).toContain('Congratulations');
  });

  it('includes all offer details', () => {
    const result = offerLetterTemplate(baseArgs);
    expect(result.html).toContain('Engineering Lead');
    expect(result.html).toContain('Technology');
    expect(result.html).toContain('March 1, 2026');
    expect(result.html).toContain('$120,000/year');
  });

  it('includes offer expiry date', () => {
    const result = offerLetterTemplate(baseArgs);
    expect(result.html).toContain('February 15, 2026');
  });

  it('includes contact email', () => {
    const result = offerLetterTemplate(baseArgs);
    expect(result.html).toContain('hr@company.com');
  });

  it('includes contact phone when provided', () => {
    const result = offerLetterTemplate({
      ...baseArgs,
      contactPhone: '+374 10 123456',
    });
    expect(result.html).toContain('+374 10 123456');
  });
});

describe('rejectionNoticeTemplate', () => {
  const baseArgs = {
    recipientName: 'Charlie Brown',
    vacancyTitle: 'Junior Developer',
    rejectionDate: 'January 20, 2026',
  };

  it('returns correct subject', () => {
    const result = rejectionNoticeTemplate(baseArgs);
    expect(result.subject).toBe('Application Update — Junior Developer');
  });

  it('includes candidate name', () => {
    const result = rejectionNoticeTemplate(baseArgs);
    expect(result.html).toContain('Hi Charlie Brown');
  });

  it('includes vacancy title', () => {
    const result = rejectionNoticeTemplate(baseArgs);
    expect(result.html).toContain('Junior Developer');
  });

  it('includes rejection date', () => {
    const result = rejectionNoticeTemplate(baseArgs);
    expect(result.html).toContain('January 20, 2026');
  });

  it('includes feedback when provided', () => {
    const result = rejectionNoticeTemplate({
      ...baseArgs,
      feedback: 'Your technical skills are strong, but we need more experience in React.',
    });
    expect(result.html).toContain('Feedback');
    expect(result.html).toContain('Your technical skills are strong');
  });

  it('includes encouragement to reapply when enabled', () => {
    const result = rejectionNoticeTemplate({
      ...baseArgs,
      encourageReapply: true,
    });
    expect(result.html).toContain("We'd love to stay in touch");
  });

  it('does not include encouragement when disabled', () => {
    const result = rejectionNoticeTemplate({
      ...baseArgs,
      encourageReapply: false,
    });
    expect(result.html).not.toContain("We'd love to stay in touch");
  });
});
