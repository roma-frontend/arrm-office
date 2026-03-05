import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | string;
      organizationId?: string;
      department?: string;
      position?: string;
      employeeType?: 'staff' | 'contractor' | string;
    };
  }

  interface User {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | string;
    organizationId?: string;
    department?: string;
    position?: string;
    employeeType?: 'staff' | 'contractor' | string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    sub?: string;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
    role?: 'superadmin' | 'admin' | 'supervisor' | 'employee' | string;
    organizationId?: string;
    department?: string;
    position?: string;
    employeeType?: 'staff' | 'contractor' | string;
  }
}
