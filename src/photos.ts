import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { Platform } from 'react-native';

const maxBytes = 10 * 1024 * 1024;
const bucket = 'album-media';
export const signedPhotoLifetime = 300;

export type ChosenPhoto = {
  id: string;
  uri: string;
  bytes: ArrayBuffer;
  type: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
};

export async function choosePhoto(): Promise<ChosenPhoto | undefined> {
  const picked = await launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (picked.canceled) return;

  const asset = picked.assets[0];
  if ((asset.fileSize ?? asset.file?.size ?? 0) > maxBytes) {
    throw new Error('Choose a photo up to 10 MB.');
  }

  const bytes = Platform.OS === 'web'
    ? await (asset.file ? asset.file.arrayBuffer() : (await fetch(asset.uri)).arrayBuffer())
    : await new File(asset.uri).arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error('Choose a photo up to 10 MB.');

  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
  const has = (offset: number, signature: number[]) =>
    signature.every((value, index) => header[offset + index] === value);
  const photo = { id: randomUUID(), uri: asset.uri, bytes };
  if (has(0, [255, 216, 255])) return { ...photo, type: 'image/jpeg', extension: 'jpg' };
  if (has(0, [137, 80, 78, 71, 13, 10, 26, 10])) return { ...photo, type: 'image/png', extension: 'png' };
  if (has(0, [82, 73, 70, 70]) && has(8, [87, 69, 66, 80])) {
    return { ...photo, type: 'image/webp', extension: 'webp' };
  }
  throw new Error('Choose a JPEG, PNG or WebP photo.');
}

export async function uploadPhoto(client: SupabaseClient, albumId: string, visitId: string, photo: ChosenPhoto) {
  const path = `${albumId}/${visitId}/${photo.id}.${photo.extension}`;
  const storage = client.storage.from(bucket);
  const { error } = await storage.upload(path, photo.bytes, { contentType: photo.type, upsert: false });
  if (!error) return;

  // A timed-out response or duplicate may mean this same upload already succeeded.
  const existing = await storage.exists(path);
  if (!existing.data || existing.error) throw error;
}

export async function signPhotos(client: SupabaseClient, paths: string[]) {
  const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, signedPhotoLifetime);
  if (error) throw error;
  return Object.fromEntries((data ?? []).flatMap((photo) =>
    photo.path && photo.signedUrl ? [[photo.path, photo.signedUrl]] : []));
}

export async function removePhoto(client: SupabaseClient, path: string) {
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw error;
}
