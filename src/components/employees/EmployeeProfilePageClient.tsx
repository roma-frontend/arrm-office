'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import EmployeeProfileDetail from '@/components/employees/EmployeeProfileDetail';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import Link from 'next/link';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';

export default function EmployeeProfilePageClient() {
  const { t } = useTranslation();
  const params = useParams();
  const employeeId = params.id as string;

  const employee = useQuery(
    api.users.queries.getUserById,
    employeeId ? { userId: employeeId as Id<'users'> } : 'skip',
  );

  if (employee === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (employee === null) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <Link href="/employees">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('employees.backToEmployees')}
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-(--warning-text) mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-(--text-primary) mb-1">
              {t('employees.employeeNotFound')}
            </h3>
            <p className="text-sm text-(--text-muted)">{t('employees.employeeNotFoundDesc')}</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <Link href="/employees">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('employees.backToEmployees')}
          </Button>
        </Link>
      </div>
      <EmployeeProfileDetail employeeId={employeeId as Id<'users'>} />
    </motion.div>
  );
}
