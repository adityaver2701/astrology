import { describe, it, expect } from 'vitest';
import { parseConnectionString, createSasToken } from './push.js';

// Dummy values only — not a real hub or key.
const CS = 'Endpoint=sb://astro-test.servicebus.windows.net/;SharedAccessKeyName=DefaultListenSharedAccessSignature;SharedAccessKey=dummy-test-key=';

describe('parseConnectionString', () => {
  it('extracts https endpoint, key name and key (keeps "=" inside the key)', () => {
    expect(parseConnectionString(CS)).toEqual({
      endpoint: 'https://astro-test.servicebus.windows.net',
      keyName: 'DefaultListenSharedAccessSignature',
      key: 'dummy-test-key=',
    });
  });
  it('returns null for missing parts', () => {
    expect(parseConnectionString('')).toBeNull();
    expect(parseConnectionString('Endpoint=sb://x/')).toBeNull();
  });
});

describe('createSasToken', () => {
  it('matches an independently computed HMAC-SHA256 signature', async () => {
    const { endpoint, keyName, key } = parseConnectionString(CS);
    const token = await createSasToken(`${endpoint}/hub-x`, keyName, key, 3600, 1700000000 * 1000);
    expect(token).toBe('SharedAccessSignature sr=https%3A%2F%2Fastro-test.servicebus.windows.net%2Fhub-x&sig=LdcM7XizqGBM7NVQHno90Hmax4mN9920Kg0h1C99dLI%3D&se=1700003600&skn=DefaultListenSharedAccessSignature');
  });
});
