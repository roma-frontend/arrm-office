/**
 * Session intelligence — derive a human-readable device label from a user
 * agent string. Brand names are universal, so the label is locale-neutral:
 * "Chrome · Windows", "Safari · iOS", "Firefox · macOS".
 */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua) || /Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os;
}

/** Short country/city location line, locale-neutral formatting. */
export function locationLabel(
  country: string | null | undefined,
  city: string | null | undefined,
): string | null {
  if (!country && !city) return null;
  return [city, country].filter(Boolean).join(', ');
}
