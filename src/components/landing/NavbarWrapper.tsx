'use client';

import Navbar from './Navbar';

export default function NavbarWrapper({ embedded = false }: { embedded?: boolean }) {
  return <Navbar embedded={embedded} />;
}
