import { TourStep } from './OnboardingTour';

export function getRegisterTourSteps(t: (key: string, fallback: string) => string): TourStep[] {
  return [
    {
      target: '#register-card',
      title: t('onboarding.register.welcome.title', '🎉 Welcome to Registration!'),
      description: t(
        'onboarding.register.welcome.desc',
        "Let's get you registered! This will only take a minute.",
      ),
      placement: 'center',
      highlight: false,
    },
    {
      target: '#org-search',
      title: t('onboarding.register.orgSearch.title', '🏢 Search Organization'),
      description: t(
        'onboarding.register.orgSearch.desc',
        'Start typing your organization name. The system will find it automatically!',
      ),
      placement: 'bottom',
      highlight: true,
    },
    {
      target: '#personal-details-form',
      title: t('onboarding.register.personalDetails.title', '👤 Personal Details'),
      description: t(
        'onboarding.register.personalDetails.desc',
        'Fill in your details. We added smart hints for your convenience!',
      ),
      placement: 'right',
      highlight: true,
    },
    {
      target: "#email-field, input[type='email']",
      title: t('onboarding.register.emailSmart.title', '✨ Smart Email Input'),
      description: t(
        'onboarding.register.emailSmart.desc',
        'The system will auto-check your email and suggest corrections if it finds typos!',
      ),
      placement: 'bottom',
      highlight: true,
    },
    {
      target: "#password-field, div:has(input[type='password'])",
      title: t('onboarding.register.passwordSecure.title', '🔐 Secure Password'),
      description: t(
        'onboarding.register.passwordSecure.desc',
        'Create a strong password or use the generator. The indicator shows security level!',
      ),
      placement: 'bottom',
      highlight: true,
    },
    {
      target: "button:has-text('🔄'), button:has-text('Сгенерировать')",
      title: t('onboarding.register.passwordGen.title', '🎲 Password Generator'),
      description: t(
        'onboarding.register.passwordGen.desc',
        'Click to create a strong password automatically. It will be copied to clipboard!',
      ),
      placement: 'left',
      highlight: true,
    },
    {
      target: ".password-strength-indicator, div[class*='strength']",
      title: t('onboarding.register.strengthIndicator.title', '📊 Password Strength'),
      description: t(
        'onboarding.register.strengthIndicator.desc',
        'Watch the color: 🔴 Weak → 🟠 Medium → 🟡 Good → 🟢 Strong → 💎 Excellent',
      ),
      placement: 'bottom',
      highlight: true,
    },
    {
      target: "div:has(svg[class*='check']), .requirements",
      title: t('onboarding.register.requirements.title', '✅ Password Requirements'),
      description: t(
        'onboarding.register.requirements.desc',
        'All checkboxes should turn green. The system will tell you what to add!',
      ),
      placement: 'right',
      highlight: true,
    },
    {
      target: '#register-card',
      title: t('onboarding.register.ready.title', '🚀 Ready to Register!'),
      description: t(
        'onboarding.register.ready.desc',
        'All smart helpers are ready! Fill the form and join the team! 🎊',
      ),
      placement: 'center',
      highlight: false,
    },
  ];
}

export function getRegisterAdvancedTips(t: (key: string, fallback: string) => string): TourStep[] {
  return [
    {
      target: "button:has(svg[class*='copy'])",
      title: t('onboarding.register.copyPassword.title', '📋 Copy Password'),
      description: t(
        'onboarding.register.copyPassword.desc',
        'Click to copy password to clipboard for safe storage.',
      ),
      placement: 'left',
      highlight: true,
    },
    {
      target: "button:has(svg[class*='eye'])",
      title: t('onboarding.register.togglePassword.title', '👁️ Show/Hide Password'),
      description: t(
        'onboarding.register.togglePassword.desc',
        'Toggle password visibility for easy typing.',
      ),
      placement: 'left',
      highlight: true,
    },
    {
      target: "div[class*='suggestion']",
      title: t('onboarding.register.smartSuggestions.title', '💡 Smart Suggestions'),
      description: t(
        'onboarding.register.smartSuggestions.desc',
        'The system analyzes your input and suggests improvements in real time!',
      ),
      placement: 'top',
      highlight: true,
    },
  ];
}
