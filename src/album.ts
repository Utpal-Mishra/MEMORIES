import type { SupabaseClient } from '@supabase/supabase-js';

export type Place = {
  id: string;
  album_id: string;
  name: string;
  latitude: number;
  longitude: number;
};
export type Visit = {
  id: string;
  album_id: string;
  place_id: string;
  visited_on: string;
  brief: string;
  category: string;
  created_at: string;
};
export type AlbumData = { albumId: string; places: Place[]; visits: Visit[] };
export type VisitInput = {
  request_id: string;
  target_album: string;
  existing_place: string | null;
  place_name: string | null;
  place_lat: number | null;
  place_lon: number | null;
  visit_date: string;
  visit_brief: string;
  visit_category: string;
};

export async function loadAlbum(client: SupabaseClient, signal?: AbortSignal): Promise<AlbumData> {
  const query = client.rpc('read_album');
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  if (error || !data?.albumId) throw error ?? new Error('Album unavailable');
  return data as AlbumData;
}

export async function saveVisit(client: SupabaseClient, input: VisitInput) {
  const { data, error } = await client.rpc('save_visit', input);
  if (error || typeof data !== 'string') throw error ?? new Error('Visit save failed');
  return data;
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function today() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

export const categories = [
  { value: 'days_out', label: 'Days out' }, { value: 'trips', label: 'Trips' },
  { value: 'food_drink', label: 'Food & drink' }, { value: 'little_moments', label: 'Little moments' },
];
