const NATIVE_API_ORIGIN = 'https://www.sprachschule-app.com';

// Every /api call goes through here. On the web VITE_API_BASE_URL is unset and
// paths stay relative (same origin as the page). The native build sets it,
// because a Capacitor webview is served from capacitor://localhost or
// https://localhost, where a relative /api path resolves to nothing.
// Read per call, not at import, so tests can stub the env.
export function apiUrl(path) {
  // Authenticated callers attach the session's bearer token, so neither the
  // path nor the native build configuration may choose the destination.
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new TypeError(`apiUrl: not an /api path: ${String(path).slice(0, 80)}`);
  }

  const configuredBase = import.meta.env.VITE_API_BASE_URL || '';
  if (!configuredBase) return path;

  const normalizedBase = configuredBase.endsWith('/')
    ? configuredBase.slice(0, -1)
    : configuredBase;
  if (normalizedBase !== NATIVE_API_ORIGIN) {
    throw new TypeError('apiUrl: VITE_API_BASE_URL is not the approved API origin');
  }

  // Return the trusted constant rather than environment-controlled input so a
  // compromised or mistaken native build cannot exfiltrate bearer tokens.
  return NATIVE_API_ORIGIN + path;
}
