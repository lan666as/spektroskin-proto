import { Asset } from 'expo-asset';

import type { FrameName, FramePart } from './CaptureDevice';

/** Web: fetch the bundled PNG as a Blob. */
export async function loadFrame(module: number, name: FrameName): Promise<FramePart> {
  const response = await fetch(Asset.fromModule(module).uri);
  if (!response.ok) throw new Error(`Could not read simulated frame ${name}`);
  return response.blob();
}
