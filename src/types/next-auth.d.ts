// Module augmentation for Auth.js / next-auth v5.
//
// The top-level `import` below is load-bearing: without at least one top-level
// import/export this file is treated as a global script, and `declare module`
// blocks REPLACE the real module declarations instead of merging into them.
// That silently wipes next-auth's own exports (NextAuthConfig, the default
// NextAuth function, getToken, …) and produces confusing TS2305/TS2349 errors
// far away from this file.
import type { DefaultSession } from '@auth/core/types';

// next-auth v5 re-exports its types from @auth/core, and different entry points
// resolve to one or the other depending on how a file imports them — so both
// module ids need the same augmentation.

declare module '@auth/core/types' {
  interface User {
    role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
    organizationId?: string;
    isApproved?: boolean;
    department?: string;
    position?: string;
    employeeType?: string;
    avatar?: string;
  }

  interface Session {
    // Narrowed from DefaultSession['user']?: User — every session this app
    // creates goes through the `session` callback, which always sets `user`.
    user: NonNullable<DefaultSession['user']>;
    convexToken?: string;
  }
}

declare module 'next-auth' {
  interface User {
    role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
    organizationId?: string;
    isApproved?: boolean;
    department?: string;
    position?: string;
    employeeType?: string;
    avatar?: string;
  }

  interface Session {
    user: NonNullable<DefaultSession['user']>;
    convexToken?: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
    organizationId?: string;
    isApproved?: boolean;
    department?: string;
    position?: string;
    employeeType?: string;
    avatar?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
    organizationId?: string;
    isApproved?: boolean;
    department?: string;
    position?: string;
    employeeType?: string;
    avatar?: string;
  }
}
