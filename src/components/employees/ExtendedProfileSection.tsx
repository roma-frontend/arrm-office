'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Briefcase,
  Clock,
  Phone,
  User,
  Globe,
  Linkedin,
  Github,
  ExternalLink,
  GraduationCap,
  Building2,
  CalendarDays,
  Award,
  BookOpen,
  Heart,
} from 'lucide-react';
import { motion } from '@/lib/cssMotion';

// ── Types ──
interface WorkSchedule {
  startTime: string;
  endTime: string;
  workingDays: string[];
  flexHours: boolean;
}

interface SocialLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

interface WorkHistoryEntry {
  company: string;
  position: string;
  startDate: string;
  endDate?: string;
  description?: string;
}

interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
}

export interface ExtendedProfileData {
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  workFormat?: 'remote' | 'office' | 'hybrid';
  workSchedule?: WorkSchedule;
  socialLinks?: SocialLinks;
  structuredWorkHistory?: WorkHistoryEntry[];
  structuredEducation?: EducationEntry[];
  dateOfBirth?: string;
}

interface ExtendedProfileSectionProps {
  data: ExtendedProfileData | null | undefined;
  canEdit: boolean;
  onEdit: () => void;
}

// ── Helper ──
const WORK_FORMAT_MAP: Record<string, { label: string; icon: string; color: string }> = {
  remote: {
    label: 'extendedProfile.workFormatRemote',
    icon: '🏠',
    color: 'bg-blue-500/10 text-blue-500',
  },
  office: {
    label: 'extendedProfile.workFormatOffice',
    icon: '🏢',
    color: 'bg-amber-500/10 text-amber-500',
  },
  hybrid: {
    label: 'extendedProfile.workFormatHybrid',
    icon: '🔄',
    color: 'bg-purple-500/10 text-purple-500',
  },
};

const DAY_SHORT: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

// ── Section Wrapper ──
function SectionCard({
  icon,
  title,
  children,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <Card className="overflow-hidden border-(--border)/60 hover:border-(--border) transition-all duration-300 group">
        <CardHeader className="pb-3 border-b border-(--border)/40">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-(--text-primary)">
            <span className="p-1.5 rounded-lg bg-(--primary)/10 text-(--primary)">{icon}</span>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

// ── Info Row ──
function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5 group/item">
      {icon && (
        <span className="mt-0.5 shrink-0 text-(--text-muted) opacity-60 group-hover/item:opacity-100 transition-opacity">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs text-(--text-muted) font-medium">{label}</p>
        <p className="text-sm text-(--text-primary) break-words">{value}</p>
      </div>
    </div>
  );
}

// ── Timeline Item ──
function TimelineItem({
  title,
  subtitle,
  period,
  description,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  period: string;
  description?: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative pl-8 pb-5 last:pb-0 group/timeline">
      {/* Connector line */}
      <div className="absolute left-[11px] top-2 bottom-0 w-px bg-(--border) group-last/timeline:hidden" />
      {/* Dot */}
      <div className="absolute left-0 top-1 w-[23px] h-[23px] rounded-full border-2 border-(--border) bg-(--background) flex items-center justify-center group-hover/timeline:border-(--primary) transition-colors">
        <span className="text-[10px]">{icon}</span>
      </div>
      <div>
        <p className="text-sm font-medium text-(--text-primary)">{title}</p>
        <p className="text-xs text-(--text-muted)">{subtitle}</p>
        <p className="text-[11px] text-(--text-muted)/70 mt-0.5 flex items-center gap-1">
          <CalendarDays className="w-3 h-3" />
          {period}
        </p>
        {description && (
          <p className="text-xs text-(--text-muted)/80 mt-1 leading-relaxed">{description}</p>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function ExtendedProfileSection({
  data,
  canEdit,
  onEdit,
}: ExtendedProfileSectionProps) {
  const { t } = useTranslation(['modules', 'common']);

  if (!data) return null;

  const hasAnyData =
    data.address ||
    data.emergencyContactName ||
    data.emergencyContactPhone ||
    data.workFormat ||
    data.workSchedule ||
    data.socialLinks?.linkedin ||
    data.socialLinks?.github ||
    data.socialLinks?.portfolio ||
    data.structuredWorkHistory?.length ||
    data.structuredEducation?.length ||
    data.dateOfBirth;

  if (!hasAnyData && !canEdit) return null;

  const workFormatInfo = data.workFormat ? WORK_FORMAT_MAP[data.workFormat] : null;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-(--text-primary) flex items-center gap-2">
          <User className="w-5 h-5 text-(--primary)" />
          {t('extendedProfile.title', 'Extended Profile')}
        </h2>
        {canEdit && (
          <button
            onClick={onEdit}
            className="text-xs font-medium text-(--primary) hover:text-(--primary)/80 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-(--primary)/5"
          >
            {t('common.edit', 'Edit')}
          </button>
        )}
      </div>

      {/* Empty state */}
      {!hasAnyData && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-dashed border-(--border)/50">
            <CardContent className="p-8 text-center">
              <User className="w-10 h-10 text-(--text-muted) mx-auto mb-3 opacity-30" />
              <p className="text-sm text-(--text-muted) mb-1">
                {t('extendedProfile.noData', 'No extended profile data yet')}
              </p>
              <p className="text-xs text-(--text-muted)/60">
                {t(
                  'extendedProfile.noDataHint',
                  'Click Edit to add work format, schedule, address, and more',
                )}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Personal Details */}
      {(data.dateOfBirth || data.address) && (
        <SectionCard
          icon={<Heart className="w-4 h-4" />}
          title={t('extendedProfile.personalDetails', 'Personal Details')}
          delay={0.05}
        >
          <div className="space-y-1">
            {data.dateOfBirth && (
              <InfoRow
                label={t('extendedProfile.dateOfBirth', 'Date of Birth')}
                value={data.dateOfBirth}
                icon={<CalendarDays className="w-3.5 h-3.5" />}
              />
            )}
            {data.address && (
              <InfoRow
                label={t('extendedProfile.address', 'Address')}
                value={data.address}
                icon={<MapPin className="w-3.5 h-3.5" />}
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* Work Details */}
      {(data.workFormat || data.workSchedule) && (
        <SectionCard
          icon={<Briefcase className="w-4 h-4" />}
          title={t('extendedProfile.workDetails', 'Work Details')}
          delay={0.1}
        >
          <div className="space-y-3">
            {workFormatInfo && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${workFormatInfo.color}`}
                >
                  {workFormatInfo.icon} {t(workFormatInfo.label)}
                </span>
              </div>
            )}

            {data.workSchedule && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-(--text-muted)" />
                  <span className="text-(--text-primary) font-medium">
                    {data.workSchedule.startTime} – {data.workSchedule.endTime}
                  </span>
                  {data.workSchedule.flexHours && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {t('extendedProfile.flexHours', 'Flex')}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    'monday',
                    'tuesday',
                    'wednesday',
                    'thursday',
                    'friday',
                    'saturday',
                    'sunday',
                  ].map((day) => {
                    const isActive = data.workSchedule?.workingDays.includes(day);
                    return (
                      <span
                        key={day}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium transition-all ${
                          isActive
                            ? 'bg-(--primary)/10 text-(--primary)'
                            : 'bg-(--background-subtle) text-(--text-muted)/50 line-through'
                        }`}
                      >
                        {DAY_SHORT[day] || day.slice(0, 3)}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Emergency Contact */}
      {data.emergencyContactName && (
        <SectionCard
          icon={<Phone className="w-4 h-4" />}
          title={t('extendedProfile.emergencyContact', 'Emergency Contact')}
          delay={0.15}
        >
          <div className="space-y-1">
            <InfoRow
              label={t('extendedProfile.contactName', 'Name')}
              value={data.emergencyContactName}
              icon={<User className="w-3.5 h-3.5" />}
            />
            {data.emergencyContactPhone && (
              <InfoRow
                label={t('extendedProfile.contactPhone', 'Phone')}
                value={data.emergencyContactPhone}
                icon={<Phone className="w-3.5 h-3.5" />}
              />
            )}
            {data.emergencyContactRelation && (
              <InfoRow
                label={t('extendedProfile.contactRelation', 'Relationship')}
                value={data.emergencyContactRelation}
                icon={<Heart className="w-3.5 h-3.5" />}
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* Social Links */}
      {(data.socialLinks?.linkedin || data.socialLinks?.github || data.socialLinks?.portfolio) && (
        <SectionCard
          icon={<Globe className="w-4 h-4" />}
          title={t('extendedProfile.socialLinks', 'Social Links')}
          delay={0.2}
        >
          <div className="flex flex-wrap gap-2">
            {data.socialLinks.linkedin && (
              <a
                href={data.socialLinks.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-all"
              >
                <Linkedin className="w-3.5 h-3.5" />
                LinkedIn
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {data.socialLinks.github && (
              <a
                href={data.socialLinks.github}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-700 dark:text-gray-300 hover:bg-gray-500/20 transition-all"
              >
                <Github className="w-3.5 h-3.5" />
                GitHub
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {data.socialLinks.portfolio && (
              <a
                href={data.socialLinks.portfolio}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all"
              >
                <Briefcase className="w-3.5 h-3.5" />
                {t('extendedProfile.portfolio', 'Portfolio')}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </SectionCard>
      )}

      {/* Work History */}
      {data.structuredWorkHistory && data.structuredWorkHistory.length > 0 && (
        <SectionCard
          icon={<Building2 className="w-4 h-4" />}
          title={t('extendedProfile.workHistory', 'Work History')}
          delay={0.25}
        >
          <div className="space-y-0">
            {data.structuredWorkHistory.map((entry, idx) => (
              <TimelineItem
                key={idx}
                title={entry.position}
                subtitle={`${entry.company}`}
                period={`${entry.startDate} – ${entry.endDate || t('extendedProfile.present', 'Present')}`}
                description={entry.description}
                icon={<Briefcase className="w-3 h-3" />}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Education */}
      {data.structuredEducation && data.structuredEducation.length > 0 && (
        <SectionCard
          icon={<GraduationCap className="w-4 h-4" />}
          title={t('extendedProfile.education', 'Education')}
          delay={0.3}
        >
          <div className="space-y-0">
            {data.structuredEducation.map((entry, idx) => (
              <TimelineItem
                key={idx}
                title={`${entry.degree} in ${entry.field}`}
                subtitle={entry.institution}
                period={`${entry.startDate} – ${entry.endDate || t('extendedProfile.present', 'Present')}`}
                icon={<BookOpen className="w-3 h-3" />}
              >
                {entry.gpa && (
                  <div className="mt-1 flex items-center gap-1">
                    <Award className="w-3 h-3 text-amber-500" />
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                      GPA: {entry.gpa}
                    </span>
                  </div>
                )}
              </TimelineItem>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
