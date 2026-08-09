// Must be imported BEFORE any module that reads
// NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL at module scope (EditEmployeeModal
// captures ADMIN_EMAIL at import time), so the "actual superadmin" branch is
// reachable in tests. Import order: this module first, then the component.
process.env.NEXT_PUBLIC_BOOTSTRAP_SUPERADMIN_EMAIL = 'root@x.com';
