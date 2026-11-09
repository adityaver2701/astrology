import { describe, it, expect } from 'vitest';
import { oauthErrorMessage } from './cloudSync';

describe('oauthErrorMessage', () => {
  it('treats access_denied as a cancellation regardless of description', () => {
    expect(oauthErrorMessage('The user denied the request', 'access_denied')).toBe('Google sign-in was cancelled.');
    expect(oauthErrorMessage('access_denied')).toBe('Google sign-in was cancelled.');
  });

  it('decodes form-encoded descriptions', () => {
    expect(oauthErrorMessage('Something+went%20wrong', 'server_error')).toBe('Google sign-in failed: Something went wrong');
  });

  it('explains a provider that is not enabled', () => {
    expect(oauthErrorMessage('Unsupported provider: provider is not enabled')).toMatch(/isn’t available yet/);
  });

  it('survives malformed percent-encoding', () => {
    expect(oauthErrorMessage('100%', 'x')).toBe('Google sign-in failed: 100%');
  });
});
