'use client';

import React, { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { logger } from '@/lib/logger';

interface WebAuthnButtonProps {
  mode: 'register' | 'login';
  userId?: string;
  onSuccess?: (credentialId: string) => void;
  disabled?: boolean;
}

export function WebAuthnButton({ mode, userId, onSuccess, disabled }: WebAuthnButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const isSupported = () => {
    return (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential === 'function'
    );
  };

  const handleRegister = async () => {
    if (!isSupported()) {
      toast.error(t('toasts.webAuthnNotSupported'));
      return;
    }
    if (!userId) {
      toast.error(t('toasts.completeRegistrationFirst'));
      return;
    }

    setLoading(true);
    try {
      // Generate challenge
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'Strata',
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode(userId),
            name: userId,
            displayName: 'Strata User',
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      })) as PublicKeyCredential;

      if (!credential) throw new Error('No credential created');

      const _response = credential.response as AuthenticatorAttestationResponse;
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

      // Store credential ID for future logins
      localStorage.setItem('webauthn-credential-id', credentialId);
      localStorage.setItem('webauthn-user-id', userId);

      onSuccess?.(credentialId);
      toast.success(t('toasts.biometricRegistered'));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        toast.error(t('toasts.authCancelled'));
      } else {
        toast.error(t('toasts.biometricRegFailed'));
        logger.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!isSupported()) {
      toast.error(t('toasts.webAuthnNotSupported'));
      return;
    }

    setLoading(true);
    try {
      const credentialId = localStorage.getItem('webauthn-credential-id');
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const allowCredentials: PublicKeyCredentialDescriptor[] = credentialId
        ? [
            {
              id: Uint8Array.from(atob(credentialId), (c) => c.charCodeAt(0)),
              type: 'public-key',
            },
          ]
        : [];

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials,
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      if (!assertion) throw new Error('No assertion');

      const assertedCredentialId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));

      onSuccess?.(assertedCredentialId);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        toast.error(t('toasts.authCancelled'));
      } else {
        toast.error(t('toasts.biometricLoginFailed'));
        logger.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handle = mode === 'register' ? handleRegister : handleLogin;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handle}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 font-medium transition-all disabled:opacity-50"
      title={mode === 'register' ? 'Register biometric' : 'Sign in with biometric'}
    >
      {loading ? <ShieldLoader size="sm" variant="inline" /> : <Fingerprint className="w-4 h-4" />}
      {!loading && <span className="text-xs">{t('auth.touchId')}</span>}
    </Button>
  );
}
