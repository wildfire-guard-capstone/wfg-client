/** Tokens are session state, never an environment variable or a checked-in credential. */
export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}
export function createMemoryTokenStore(
  initialToken: string | null = null,
): TokenStore {
  let token = initialToken;
  return {
    get: () => token,
    set: (value) => {
      token = value;
    },
    clear: () => {
      token = null;
    },
  };
}
export function createSessionTokenStore(
  storage: Storage,
  key = 'wfg-api-access-token',
): TokenStore {
  return {
    get: () => storage.getItem(key),
    set: (token) => storage.setItem(key, token),
    clear: () => storage.removeItem(key),
  };
}
