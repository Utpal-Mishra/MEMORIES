export type DateIdea = {
  name: string;
  area: string;
  category: 'days_out' | 'trips' | 'little_moments';
  latitude: number;
  longitude: number;
  description: string;
  sourceLabel: string;
  sourceUrl: string;
};

// Curated from the linked visitor pages, checked 16 November 2026.
// Coordinates are suggested pins and can be adjusted in the visit editor.
export const dateIdeas: readonly DateIdea[] = [
  {
    name: 'National Gallery of Ireland',
    area: 'Dublin city centre',
    category: 'days_out',
    latitude: 53.3409,
    longitude: -6.2528,
    description: 'Spend an afternoon in the galleries and each pick a painting to show the other.',
    sourceLabel: 'National Gallery visitor guide',
    sourceUrl: 'https://www.nationalgallery.ie/visit-us/visitor-guide',
  },
  {
    name: 'National Botanic Gardens',
    area: 'Glasnevin',
    category: 'days_out',
    latitude: 53.3728,
    longitude: -6.2701,
    description: 'Walk through the gardens and glasshouses, then stop for coffee together.',
    sourceLabel: 'Botanic Gardens visitor information',
    sourceUrl: 'https://botanicgardens.ie/glasnevin/',
  },
  {
    name: 'Howth Cliff Path Loop',
    area: 'Howth',
    category: 'trips',
    latitude: 53.3891,
    longitude: -6.0742,
    description: 'Start at Howth station and follow the coastal loop when conditions allow. Check the route before leaving.',
    sourceLabel: 'Visit Dublin trail guide',
    sourceUrl: 'https://www.visitdublin.com/howth-cliff-path-loop',
  },
  {
    name: 'Phoenix Park Walled Garden',
    area: 'Phoenix Park',
    category: 'little_moments',
    latitude: 53.3655,
    longitude: -6.3327,
    description: 'Take a walk through the walled garden near the visitor centre.',
    sourceLabel: 'Phoenix Park visitor information',
    sourceUrl: 'https://phoenixpark.ie/directions-2/',
  },
  {
    name: 'St Stephen’s Green',
    area: 'Dublin city centre',
    category: 'little_moments',
    latitude: 53.3381,
    longitude: -6.2591,
    description: 'Pick up a coffee and find a bench by the water in the middle of the city.',
    sourceLabel: 'Heritage Ireland visitor information',
    sourceUrl: 'https://heritageireland.ie/visit/places-to-visit/st-stephens-green/',
  },
];
