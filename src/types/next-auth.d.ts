declare module 'next-auth' {
  interface User {
    id: string;
    name: string;
    email: string;
    image?: string;
    role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
    organizationId?: string;
    isApproved?: boolean;
    department?: string;
    position?: string;
    employeeType?: string;
    avatar?: string;
  }

  interface Session {
    user: User;
    convexToken?: string;
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
