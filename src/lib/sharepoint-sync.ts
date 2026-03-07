/**
 * SharePoint Employee Sync Utilities
 * Microsoft Graph API integration for syncing SharePoint List → Convex users
 */

// ── Column mapping (configurable — update when exact column names are known) ──
export const COLUMN_MAP = {
  name: "Title",           // or "FullName"
  email: "Email",          // or "WorkEmail"
  department: "Department",
  position: "JobTitle",
  phone: "WorkPhone",
  location: "Office",
  employeeType: "Category", // maps to "staff" / "contractor"
  status: "Status",         // for filtering inactive entries
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface SharePointEmployee {
  name: string;
  email: string;
  department?: string;
  position?: string;
  phone?: string;
  location?: string;
  employeeType: "staff" | "contractor";
}

export interface SharePointSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  errors: string[];
}

// ── OAuth helpers ────────────────────────────────────────────────────────────

/**
 * Build the Azure AD OAuth authorize URL (tenant-specific)
 */
export function getSharePointAuthUrl(redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID;

  if (!clientId) throw new Error("Microsoft Client ID not configured");
  if (!tenantId) throw new Error("Microsoft Tenant ID not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "Sites.Read.All offline_access User.Read",
    response_mode: "query",
  });

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens (tenant-specific endpoint)
 */
export async function exchangeSharePointCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/sharepoint/callback`;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft SharePoint OAuth credentials not configured");
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "Sites.Read.All offline_access User.Read",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange SharePoint code for tokens: ${error}`);
  }

  return response.json();
}

/**
 * Refresh an expired access token
 */
export async function refreshSharePointToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft SharePoint OAuth credentials not configured");
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "Sites.Read.All offline_access User.Read",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh SharePoint token: ${error}`);
  }

  return response.json();
}

// ── SharePoint List fetching ─────────────────────────────────────────────────

/**
 * Fetch all items from the SharePoint List (with pagination)
 */
export async function fetchSharePointListItems(
  accessToken: string
): Promise<SharePointEmployee[]> {
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const listId = process.env.SHAREPOINT_LIST_ID;

  if (!siteId || !listId) {
    throw new Error("SharePoint site/list IDs not configured");
  }

  const employees: SharePointEmployee[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch SharePoint list items: ${error}`);
    }

    const data = await response.json();

    for (const item of data.value || []) {
      const fields = item.fields || {};
      const mapped = mapSharePointToEmployee(fields);
      if (mapped) {
        employees.push(mapped);
      }
    }

    // Follow @odata.nextLink for pagination
    url = data["@odata.nextLink"] || null;
  }

  return employees;
}

/**
 * Map SharePoint list item fields → SharePointEmployee
 * Returns null if the row should be skipped (no email, inactive status)
 */
export function mapSharePointToEmployee(
  fields: Record<string, unknown>
): SharePointEmployee | null {
  const email = (fields[COLUMN_MAP.email] as string)?.trim()?.toLowerCase();
  if (!email) return null;

  // Skip rows where status indicates inactive
  const status = (fields[COLUMN_MAP.status] as string)?.toLowerCase();
  if (status === "inactive" || status === "terminated" || status === "disabled") {
    return null;
  }

  const rawType = (fields[COLUMN_MAP.employeeType] as string)?.toLowerCase();
  const employeeType: "staff" | "contractor" =
    rawType === "contractor" ? "contractor" : "staff";

  return {
    name: (fields[COLUMN_MAP.name] as string) || email.split("@")[0],
    email,
    department: fields[COLUMN_MAP.department] as string | undefined,
    position: fields[COLUMN_MAP.position] as string | undefined,
    phone: fields[COLUMN_MAP.phone] as string | undefined,
    location: fields[COLUMN_MAP.location] as string | undefined,
    employeeType,
  };
}
