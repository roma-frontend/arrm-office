/**
 * Every dashboard screen must scope its Convex queries through the organization
 * selector, not through the viewer's own `user.organizationId`.
 *
 * A superadmin picks an organization in the navbar selector, which writes to
 * `useOrgSelectorStore`; `useSelectedOrganization` reads it and falls back to the
 * viewer's own org for everyone else. A screen that reads `user.organizationId`
 * directly is pinned to the viewer's organization: switching orgs leaves the data
 * unchanged, and any create mutation on that screen writes into the wrong tenant.
 *
 * /org-chart, /onboarding, /offboarding, /signatures, /recruitment,
 * /admin/ai-governance and /admin/join-requests all shipped with that defect.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

/** Top-level client component behind each org-scoped sidebar route. */
const ROUTE_CLIENTS: Record<string, string> = {
  '/org-chart': 'src/components/orgchart/OrgChartClient.tsx',
  '/onboarding': 'src/components/OnboardingClient.tsx',
  '/offboarding': 'src/components/OffboardingClient.tsx',
  '/signatures': 'src/components/ESignaturesClient.tsx',
  '/recruitment': 'src/components/RecruitmentClient.tsx',
  '/admin/ai-governance': 'src/components/ai/AIGovernancePanel.tsx',
  '/admin/join-requests': 'src/components/admin/AdminJoinRequestsClient.tsx',
  '/goals': 'src/components/GoalsClient.tsx',
  '/tasks': 'src/components/tasks/TasksClient.tsx',
  '/projects': 'src/components/projects/ProjectsClient.tsx',
  '/expenses': 'src/components/expenses/ExpensesClient.tsx',
  '/compensation': 'src/components/compensation/CompensationClient.tsx',
  '/recognition': 'src/components/recognition/RecognitionClient.tsx',
  '/surveys': 'src/components/SurveysClient.tsx',
  '/news': 'src/components/news/NewsClient.tsx',
  '/assets': 'src/components/assets/AssetsClient.tsx',
  '/rooms': 'src/components/rooms/RoomsBoard.tsx',
  '/performance': 'src/components/PerformanceClient.tsx',
};

const routes = Object.keys(ROUTE_CLIENTS);
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('organization selector wiring', () => {
  it.each(routes)('%s reacts to the selected organization', (route) => {
    const source = read(ROUTE_CLIENTS[route]);
    expect(source).toContain('useSelectedOrganization');
  });

  it.each(routes)('%s feeds the selector value into its queries', (route) => {
    const source = read(ROUTE_CLIENTS[route]);

    // Calling the hook is not sufficient on its own: parking the result in
    // `selectedOrgId` and then deriving the query arg from `user.organizationId`
    // leaves the screen pinned while still importing the hook. So require the
    // hook's value to be referenced beyond its own declaration — which covers
    // every shape in use here (`??`, `||`, and a ternary on the superadmin role)
    // without pinning the assertion to one of them.
    const assignedTo = /const\s+(\w+)\s*(?::[^=]+)?=\s*useSelectedOrganization\(\)/.exec(
      source,
    )?.[1];

    // Assigned straight to the id the queries use, e.g. `const orgId = useSelectedOrganization()`.
    if (assignedTo !== undefined && assignedTo !== 'selectedOrgId') {
      expect({ route, assignedTo }).toEqual({ route, assignedTo });
      return;
    }

    const references = [...source.matchAll(/\bselectedOrgId\b/g)].length;

    expect({ route, referencedBeyondDeclaration: references > 1 }).toEqual({
      route,
      referencedBeyondDeclaration: true,
    });
  });

  it.each(routes)('%s does not pin a query to the viewer own organization', (route) => {
    const source = read(ROUTE_CLIENTS[route]);

    // `organizationId: user.organizationId` ignores the selector outright.
    const pinned = [...source.matchAll(/organizationId:\s*user\??\.organizationId/g)];

    expect({ route, pinned: pinned.map((m) => m[0]) }).toEqual({ route, pinned: [] });
  });

  it('clears the org chart when switching to an organization that has none', () => {
    // The tree is copied into local React Flow state. Guarding that sync on a
    // non-empty result stranded the previous org's chart on screen, because an
    // org with no chart resolves the query to [] rather than to undefined.
    const source = read(ROUTE_CLIENTS['/org-chart']);

    expect(source).not.toContain('orgTree && orgTree.length > 0');
    expect(source).toContain('if (orgTree === undefined) return;');
  });
});
