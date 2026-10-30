import { getState, setState } from '../../lib/state.js';

// Outlook.com / Hotmail no longer accept plain passwords over IMAP/SMTP, so we use OAuth2
// with a device-code login. The refresh token is stored in the database; Microsoft rotates
// it on every refresh, so the new one is saved each time.

const REFRESH_TOKEN_KEY = 'microsoft.refreshToken';
const SCOPES = [
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send',
  'offline_access'
].join(' ');

function authority(): string {
  return `https://login.microsoftonline.com/${process.env.MS_TENANT || 'consumers'}/oauth2/v2.0`;
}

function clientId(): string {
  const id = process.env.MS_CLIENT_ID;
  if (!id) {
    throw new Error('MS_CLIENT_ID is not set. See docs/EMAIL_INGEST.md for registering the app.');
  }
  return id;
}

async function postForm(url: string, form: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form)
  });
  return response.json();
}

export function isMicrosoftConfigured(): boolean {
  return (process.env.MAIL_PROVIDER || '').toLowerCase() === 'outlook' && !!process.env.MS_CLIENT_ID;
}

export async function hasMicrosoftLogin(): Promise<boolean> {
  return isMicrosoftConfigured() && !!(await getState(REFRESH_TOKEN_KEY));
}

// Interactive: prints a code for the user to enter at microsoft.com/link, then waits for approval
export async function deviceCodeLogin(log: (message: string) => void = console.log): Promise<void> {
  const device = await postForm(`${authority()}/devicecode`, { client_id: clientId(), scope: SCOPES });
  if (device.error) {
    throw new Error(`Device code request failed: ${device.error_description || device.error}`);
  }

  log(device.message);

  let interval = (device.interval || 5) * 1000;
  const deadline = Date.now() + (device.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval));

    const token = await postForm(`${authority()}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId(),
      device_code: device.device_code
    });

    if (token.error === 'authorization_pending') continue;
    if (token.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (token.error) {
      throw new Error(`Login failed: ${token.error_description || token.error}`);
    }

    await setState(REFRESH_TOKEN_KEY, token.refresh_token);
    return;
  }

  throw new Error('Login timed out; run it again.');
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getMicrosoftAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const refreshToken = await getState(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new Error('Not signed in to Outlook. Run: npm run mail:login');
  }

  const token = await postForm(`${authority()}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId(),
    refresh_token: refreshToken,
    scope: SCOPES
  });

  if (token.error) {
    throw new Error(`Outlook token refresh failed (${token.error}); run: npm run mail:login`);
  }

  if (token.refresh_token) {
    await setState(REFRESH_TOKEN_KEY, token.refresh_token);
  }

  cachedToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000
  };
  return cachedToken.accessToken;
}
