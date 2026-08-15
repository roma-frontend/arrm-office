'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  Car,
  User,
  Settings,
  Calendar,
  CheckCircle2,
  X,
  ArrowRight,
  Shield,
  Clock,
  Phone,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';

interface RegisterDriverModalProps {
  userName: string;
  userEmail: string;
  userPhone?: string;
  onSubmit: (data: {
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: string;
    vehicleColor: string;
    licensePlate: string;
    maxPassengers: number;
    vehicleType: string;
    notes?: string;
    availability: {
      monday: boolean;
      tuesday: boolean;
      wednesday: boolean;
      thursday: boolean;
      friday: boolean;
      saturday: boolean;
      sunday: boolean;
    };
  }) => Promise<void>;
  onClose: () => void;
}

const steps = ['personal', 'vehicle', 'schedule', 'confirm'];

const stepIcons: LucideIcon[] = [User, Car, Calendar, CheckCircle2];

const getVehicleTypes = (t: TFunction) => [
  { id: 'sedan', label: t('driverWizard.sedan', 'Sedan'), icon: '🚗' },
  { id: 'suv', label: t('driverWizard.suv', 'SUV'), icon: '🚙' },
  { id: 'van', label: t('driverWizard.van', 'Van'), icon: '🚐' },
  { id: 'luxury', label: t('driverWizard.luxury', 'Luxury'), icon: '✨' },
];

export function RegisterDriverModal({
  userName,
  userEmail,
  userPhone,
  onSubmit,
  onClose,
}: RegisterDriverModalProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
    licensePlate: '',
    maxPassengers: 4,
    vehicleType: 'sedan',
    notes: '',
    availability: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
    },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const;
  const dayLabels = {
    monday: t('driver.monday', 'Mon'),
    tuesday: t('driver.tuesday', 'Tue'),
    wednesday: t('driver.wednesday', 'Wed'),
    thursday: t('driver.thursday', 'Thu'),
    friday: t('driver.friday', 'Fri'),
    saturday: t('driver.saturday', 'Sat'),
    sunday: t('driver.sunday', 'Sun'),
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return true; // Personal info is pre-filled
      case 1:
        return (
          formData.vehicleMake.trim() &&
          formData.vehicleModel.trim() &&
          formData.licensePlate.trim()
        );
      case 2:
        return Object.values(formData.availability).some((v) => v);
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      logger.error('Failed to register:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (canProceed() && currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-2xl bg-(--card) rounded-2xl border border-(--border) shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 btn-gradient rounded-t-2xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {t('driver.registerAsDriver', 'Register as Driver')}
              </h2>
              <p className="text-white/80 text-sm mt-0.5">
                {t('driver.registerDesc', 'Join our driver team')}
              </p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => {
              const Icon: LucideIcon | undefined = stepIcons[idx];
              const isCompleted = idx < currentStep;
              const isCurrent = idx === currentStep;

              return (
                <div key={step} className="flex items-center">
                  <motion.div
                    animate={{ scale: isCurrent ? 1.1 : 1 }}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${
                      isCompleted
                        ? 'bg-(--success-solid) text-white'
                        : isCurrent
                          ? 'bg-(--success-quiet) text-(--success-text) ring-2 ring-(--success-text)'
                          : 'bg-(--background-subtle) text-(--text-muted)'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      Icon && <Icon className="w-5 h-5" />
                    )}
                  </motion.div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`w-12 sm:w-20 h-0.5 mx-2 transition-colors duration-300 ${
                        idx < currentStep ? 'bg-(--success-solid)' : 'bg-(--border)'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Step 0: Personal Info */}
            {currentStep === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-semibold">
                  {t('driver.personalInfo', 'Personal Information')}
                </h3>
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-(--background-subtle) space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-(--primary)" />
                      <div>
                        <p className="text-xs text-(--text-muted)">
                          {t('driver.fullName', 'Full Name')}
                        </p>
                        <p className="font-medium">{userName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-(--primary)" />
                      <div>
                        <p className="text-xs text-(--text-muted)">{t('driver.email', 'Email')}</p>
                        <p className="font-medium">{userEmail}</p>
                      </div>
                    </div>
                    {userPhone && (
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-(--primary)" />
                        <div>
                          <p className="text-xs text-(--text-muted)">
                            {t('driver.phone', 'Phone')}
                          </p>
                          <p className="font-medium">{userPhone}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-(--text-muted)">
                    {t(
                      'driver.personalInfoDesc',
                      'Your personal information will be used for driver registration. Vehicle details are required in the next step.',
                    )}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 1: Vehicle Info */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-semibold">
                  {t('driver.vehicleInfo', 'Vehicle Information')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('driver.make', 'Make')}</Label>
                    <Input
                      value={formData.vehicleMake}
                      onChange={(e) => setFormData((p) => ({ ...p, vehicleMake: e.target.value }))}
                      placeholder={t('driverWizard.makePlaceholder', 'Toyota')}
                      className="border-(--border) bg-(--input)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('driver.model', 'Model')}</Label>
                    <Input
                      value={formData.vehicleModel}
                      onChange={(e) => setFormData((p) => ({ ...p, vehicleModel: e.target.value }))}
                      placeholder={t('driverWizard.modelPlaceholder', 'Camry')}
                      className="border-(--border) bg-(--input)"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('driver.year', 'Year')}</Label>
                    <Input
                      type="number"
                      value={formData.vehicleYear}
                      onChange={(e) => setFormData((p) => ({ ...p, vehicleYear: e.target.value }))}
                      placeholder={t('driverWizard.yearPlaceholder', '2024')}
                      className="border-(--border) bg-(--input)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('driver.color', 'Color')}</Label>
                    <Input
                      value={formData.vehicleColor}
                      onChange={(e) => setFormData((p) => ({ ...p, vehicleColor: e.target.value }))}
                      placeholder={t('driverWizard.colorPlaceholder', 'Black')}
                      className="border-(--border) bg-(--input)"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('driver.licensePlate', 'License Plate')}</Label>
                  <Input
                    value={formData.licensePlate}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, licensePlate: e.target.value.toUpperCase() }))
                    }
                    placeholder={t('driverWizard.platePlaceholder', 'ABC-1234')}
                    className="border-(--border) bg-(--input) font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('driver.vehicleType', 'Vehicle Type')}</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {getVehicleTypes(t).map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setFormData((p) => ({ ...p, vehicleType: type.id }))}
                        className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                          formData.vehicleType === type.id
                            ? 'border-(--success-outline) bg-(--success-quiet)'
                            : 'border-(--border) bg-(--background-subtle) hover:border-(--primary)/50'
                        }`}
                      >
                        <span className="text-2xl">{type.icon}</span>
                        <p className="text-xs font-medium mt-1">{type.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('driver.maxPassengers', 'Max Passengers')}</Label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          maxPassengers: Math.max(1, p.maxPassengers - 1),
                        }))
                      }
                    >
                      -
                    </Button>
                    <span className="text-lg font-bold w-8 text-center">
                      {formData.maxPassengers}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          maxPassengers: Math.min(8, p.maxPassengers + 1),
                        }))
                      }
                    >
                      +
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Schedule */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-semibold">
                  {t('driver.availability', 'Availability')}
                </h3>
                <p className="text-sm text-(--text-muted)">
                  {t('driver.availabilityDesc', 'Select your available days')}
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {days.map((day) => (
                    <motion.button
                      key={day}
                      whileTap={{ scale: 0.95 }}
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          availability: { ...p.availability, [day]: !p.availability[day] },
                        }))
                      }
                      className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                        formData.availability[day]
                          ? 'border-(--success-outline) bg-(--success-quiet)'
                          : 'border-(--border) bg-(--background-subtle)'
                      }`}
                    >
                      <Clock
                        className={`w-4 h-4 mx-auto mb-1 ${formData.availability[day] ? 'text-(--success-text)' : 'text-(--text-muted)'}`}
                      />
                      <p className="text-xs font-medium">{dayLabels[day]}</p>
                    </motion.button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    {t('driver.notes', 'Notes')} ({t('driver.optional', 'Optional')})
                  </Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                    placeholder={t('driver.notesPlaceholder', 'Any additional information...')}
                    className="resize-none border-(--border) bg-(--input)"
                    rows={2}
                  />
                </div>
              </motion.div>
            )}

            {/* Step 3: Confirm */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-semibold">
                  {t('driver.confirmRegistration', 'Confirm Registration')}
                </h3>
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-(--background-subtle) space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-(--primary)" />
                      <div>
                        <p className="text-xs text-(--text-muted)">
                          {t('driver.driver', 'Driver')}
                        </p>
                        <p className="font-medium">{userName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Car className="w-4 h-4 text-(--primary)" />
                      <div>
                        <p className="text-xs text-(--text-muted)">
                          {t('driver.vehicle', 'Vehicle')}
                        </p>
                        <p className="font-medium">
                          {formData.vehicleYear} {formData.vehicleMake} {formData.vehicleModel} (
                          {formData.licensePlate})
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Settings className="w-4 h-4 text-(--primary)" />
                      <div>
                        <p className="text-xs text-(--text-muted)">
                          {t('driver.vehicleType', 'Type')}
                        </p>
                        <Badge variant="secondary">
                          {getVehicleTypes(t).find((vt) => vt.id === formData.vehicleType)?.icon}{' '}
                          {getVehicleTypes(t).find((vt) => vt.id === formData.vehicleType)?.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-(--background-subtle)">
                    <p className="text-xs text-(--text-muted) mb-2">
                      {t('driver.availableDays', 'Available Days')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {days
                        .filter((d) => formData.availability[d])
                        .map((d) => (
                          <Badge key={d} variant="outline" className="text-xs">
                            {dayLabels[d]}
                          </Badge>
                        ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-(--border) bg-(--background-subtle)">
          {currentStep > 0 ? (
            <Button variant="outline" onClick={prevStep} disabled={isSubmitting}>
              {t('driver.back', 'Back')}
            </Button>
          ) : (
            <div />
          )}
          {currentStep < steps.length - 1 ? (
            <Button onClick={nextStep} disabled={!canProceed()} className="gap-2">
              {t('driver.next', 'Next')}
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>{t('driver.registering', 'Registering...')}</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {t('driver.completeRegistration', 'Complete Registration')}
                </>
              )}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
