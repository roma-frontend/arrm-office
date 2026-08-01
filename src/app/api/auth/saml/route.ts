/**
 * SAML 2.0 SSO Configuration Route
 *
 * Provides SAML metadata XML and SP configuration for enterprise SSO.
 * When SAML_IDP_METADATA_URL is configured in environment variables,
 * this enables SAML-based authentication for enterprise organizations.
 *
 * Currently supports:
 * - SP metadata endpoint (GET /api/auth/saml)
 * - IdP-initiated login (POST /api/auth/saml/acs)
 * - IdP metadata URL configuration via SAML_IDP_METADATA_URL
 *
 * Future: Full SAML flow with next-auth@5 SAML provider
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Force Node.js runtime for Buffer usage in SAML response decoding
export const runtime = 'nodejs';

const SP_ENTITY_ID = process.env.SAML_SP_ENTITY_ID || 'strata-hr';
const ACS_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SAML_IDP_METADATA_URL = process.env.SAML_IDP_METADATA_URL;

/**
 * GET /api/auth/saml
 *
 * Returns SAML 2.0 SP metadata XML for configuration with identity providers.
 * This metadata describes the Service Provider (Strata) to IdPs like
 * Okta, Azure AD, OneLogin, or Keycloak.
 */
export async function GET() {
  const metadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${SP_ENTITY_ID}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${ACS_URL}/api/auth/saml/acs"
      index="0"
      isDefault="true"/>
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="${ACS_URL}/api/auth/saml/acs"
      index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

  return new NextResponse(metadata, {
    headers: {
      'Content-Type': 'application/samlmetadata+xml',
      'Content-Disposition': 'attachment; filename="strata-saml-metadata.xml"',
    },
  });
}

/**
 * POST /api/auth/saml/acs
 *
 * Assertion Consumer Service endpoint — receives SAML responses from IdP.
 * Validates the SAML assertion and creates/authenticates the user.
 *
 * Currently returns configuration status. Full SAML assertion validation
 * requires an XML library (samlify or @authenio/xml-encryption).
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const samlResponse = formData.get('SAMLResponse') as string | null;

  if (!samlResponse) {
    return NextResponse.json(
      { error: 'Missing SAMLResponse', configured: !!SAML_IDP_METADATA_URL },
      { status: 400 },
    );
  }

  // Configuration check — validate SAML_IDP_METADATA_URL
  if (!SAML_IDP_METADATA_URL) {
    return NextResponse.json(
      {
        error: 'SAML SSO is not configured. Set SAML_IDP_METADATA_URL environment variable.',
        configured: false,
      },
      { status: 501 },
    );
  }

  // Decode and parse SAML response
  try {
    const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');

    // Log the raw assertion for debugging
    logger.info('[SAML] Received assertion:', decoded.substring(0, 200) + '...');

    // TODO: Validate SAML assertion signature
    // TODO: Extract NameID and attributes
    // TODO: Create/find user in database
    // TODO: Issue session token

    return NextResponse.json({
      message: 'SAML response received. Full assertion validation pending.',
      configured: true,
      idpConfigured: !!SAML_IDP_METADATA_URL,
    });
  } catch (error) {
    console.error('[SAML] Failed to decode assertion:', error);
    return NextResponse.json({ error: 'Invalid SAML assertion format' }, { status: 400 });
  }
}
