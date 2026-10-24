import { Asset } from 'expo-asset';

import type { FrameName, FramePart } from './CaptureDevice';

/** Native: resolve the bundled PNG to a local file that FormData can upload. */
export async function loadFrame(module: number, name: FrameName): Promise<FramePart> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return { uri, name: `${name}.png`, type: 'image/png' };
}
