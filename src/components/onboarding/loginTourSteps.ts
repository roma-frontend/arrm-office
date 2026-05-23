import { TourStep } from './OnboardingTour';

export function getLoginTourSteps(t: (key: string, fallback: string) => string): TourStep[] {
  return [
    {
      target: '#login-card',
      title: t('onboarding.login.welcome.title', '👋 Welcome!'),
      description: t(
        'onboarding.login.welcome.desc',
        'Let us quickly show you all the login features!',
      ),
      placement: 'center',
      highlight: false,
    },
    {
      target: '#biometric-login',
      title: t('onboarding.login.biometric.title', '🔐 Quick Login'),
      description: t(
        'onboarding.login.biometric.desc',
        'Use fingerprint or Face ID for instant access',
      ),
      placement: 'bottom',
      highlight: true,
    },
    {
      target: '#email-login-form',
      title: t('onboarding.login.email.title', '📧 Smart Email Input'),
      description: t(
        'onboarding.login.email.desc',
        'Start typing your email — the system will auto-check it and suggest typo corrections!',
      ),
      placement: 'right',
      highlight: true,
    },
    {
      target: "#email-login-form input[type='email'], #email-login-form input[id='email']",
      title: t('onboarding.login.emailCheck.title', '✨ Auto Email Check'),
      description: t(
        'onboarding.login.emailCheck.desc',
        "If you type 'gmial.com', the system will suggest 'gmail.com'. Green checkmark = valid email!",
      ),
      placement: 'bottom',
      highlight: true,
    },
    {
      target: "#email-login-form div:has(input[type='password'])",
      title: t('onboarding.login.password.title', '🔒 Secure Password'),
      description: t(
        'onboarding.login.password.desc',
        'Click the eye icon to show/hide password. All your data is protected!',
      ),
      placement: 'bottom',
      highlight: true,
    },
    {
      target: '#join-team-link',
      title: t('onboarding.login.joinTeam.title', '👥 Join a Team'),
      description: t(
        'onboarding.login.joinTeam.desc',
        'Already have an organization? Request access from an administrator',
      ),
      placement: 'left',
      highlight: true,
    },
    {
      target: '#create-org-btn',
      title: t('onboarding.login.createOrg.title', '🏢 Create Organization'),
      description: t(
        'onboarding.login.createOrg.desc',
        'Create your own organization and invite employees',
      ),
      placement: 'right',
      highlight: true,
    },
    {
      target: '#login-card',
      title: t('onboarding.login.ready.title', '🎉 All Set!'),
      description: t(
        'onboarding.login.ready.desc',
        'Choose a convenient login method and start working! Enjoy! 🚀',
      ),
      placement: 'top',
      highlight: false,
    },
  ];
}
