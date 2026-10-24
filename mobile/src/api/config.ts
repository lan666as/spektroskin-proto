import { Platform } from 'react-native';

/**
 * The web build is served by Caddy on the same origin as the API, so it uses relative URLs.
 * Native (Expo Go) talks to the deployed API unless EXPO_PUBLIC_API_URL overrides it.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? '' : 'https://spektroskin.zidan.dev');

export function absoluteUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
}
