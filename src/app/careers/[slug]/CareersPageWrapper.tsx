'use client';

import CareersPage from '@/components/CareersPage';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export default function CareersPageWrapper({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <CareersPage orgSlug={slug} />
      <Footer />
    </div>
  );
}
