import Footer from '@/components/landing/Footer';
import Navbar from '@/components/landing/Navbar';
import { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
