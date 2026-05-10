// Hand-drawn continent and island outlines as [lon, lat] polygons. Approximate;
// intended to be recognizable, not cartographically accurate. Cities sit on or
// very near land for every airport in our catalog.

export type LonLat = [number, number];

export const CONTINENTS: { name: string; points: LonLat[] }[] = [
  // North America (incl. Mexico + Central America so MEX City and Caribbean coast sit on land)
  {
    name: 'North America',
    points: [
      [-168, 65], [-160, 71], [-150, 70], [-130, 70], [-110, 73], [-95, 75],
      [-80, 82], [-65, 82], [-55, 70], [-58, 60], [-65, 53], [-65, 45],
      [-70, 43], [-74, 40], [-77, 35], [-81, 32], [-83, 28], [-82, 25],
      // Florida tip + Gulf coast
      [-86, 30], [-90, 30], [-95, 29],
      // Down Mexican Gulf coast
      [-97, 26], [-97, 22], [-99, 20], [-94, 18], [-91, 19], [-87, 21], [-89, 18],
      // Across Central America
      [-86, 16], [-83, 12], [-79, 8],
      // Back up Pacific
      [-86, 13], [-94, 16], [-99, 18], [-104, 19], [-108, 23], [-114, 28],
      [-117, 32], [-120, 34], [-122, 38], [-124, 41], [-124, 48], [-130, 54],
      [-145, 60], [-155, 60], [-168, 65],
    ],
  },
  // Greenland
  {
    name: 'Greenland',
    points: [
      [-55, 60], [-30, 60], [-15, 75], [-25, 83], [-50, 83], [-60, 78],
      [-55, 60],
    ],
  },
  // South America (more accurate Brazilian bulge + Patagonia)
  {
    name: 'South America',
    points: [
      [-78, 12], [-72, 11], [-66, 10], [-62, 8], [-55, 6], [-50, 1],
      [-44, -2], [-38, -8], [-35, -10], [-37, -22], [-43, -25], [-48, -32],
      [-53, -38], [-58, -40], [-62, -45], [-66, -50], [-69, -53], [-72, -54],
      [-73, -50], [-74, -45], [-72, -38], [-71, -28], [-72, -18], [-78, -10],
      [-80, -3], [-79, 2], [-78, 12],
    ],
  },
  // Africa
  {
    name: 'Africa',
    points: [
      [-15, 35], [-5, 36], [10, 37], [22, 33], [33, 32], [37, 22], [42, 12],
      [50, 11], [44, 0], [42, -5], [40, -12], [40, -22], [33, -28], [25, -34],
      [18, -34], [12, -22], [9, -10], [5, -2], [-5, 5], [-12, 8], [-15, 14],
      [-15, 35],
    ],
  },
  // Eurasia (Europe + most of Asia, including Indochina dipping toward Singapore)
  {
    name: 'Eurasia',
    points: [
      [-10, 38], [-5, 45], [-2, 49], [3, 52], [10, 56], [12, 60], [22, 60],
      [30, 65], [55, 72], [80, 75], [110, 75], [140, 72], [165, 70], [170, 65],
      [155, 55], [140, 48], [128, 38], [120, 30], [115, 25], [110, 20],
      [108, 14], [104, 10], [102, 6], [100, 2], [102, 0],
      // bridge over to Vietnam coast
      [108, 8], [109, 13], [105, 18], [100, 16],
      [98, 8], [95, 18], [88, 22], [80, 14], [78, 8], [73, 18], [68, 22],
      [60, 25], [55, 26], [50, 28], [42, 38], [35, 38], [30, 38], [20, 36],
      [10, 38], [-10, 38],
    ],
  },
  // British Isles
  {
    name: 'UK',
    points: [
      [-6, 50], [-3, 50], [2, 52], [1, 57], [-5, 58], [-8, 56], [-8, 54],
      [-6, 50],
    ],
  },
  // Japan
  {
    name: 'Japan',
    points: [
      [131, 32], [135, 34], [138, 36], [141, 39], [144, 43], [145, 44],
      [142, 41], [139, 36], [135, 33], [131, 32],
    ],
  },
  // Indonesia (Sumatra + Java + Borneo as a single rough mass)
  {
    name: 'Indonesia',
    points: [
      [95, 5], [100, 4], [104, 1], [106, -2], [108, -6], [114, -8], [120, -8],
      [125, -8], [128, -3], [125, 1], [118, 4], [112, 4], [105, 6], [98, 5],
      [95, 5],
    ],
  },
  // Australia (extended east coast south to include Sydney + Melbourne)
  {
    name: 'Australia',
    points: [
      [113, -22], [115, -16], [122, -16], [130, -12], [137, -12], [142, -10],
      [145, -15], [149, -19], [152, -25], [153, -30], [151, -34], [150, -38],
      [145, -39], [140, -38], [134, -32], [125, -32], [118, -33], [115, -34],
      [113, -22],
    ],
  },
  // New Zealand
  {
    name: 'New Zealand',
    points: [
      [172, -34], [175, -36], [178, -38], [177, -42], [172, -45], [168, -46],
      [167, -43], [170, -40], [172, -34],
    ],
  },
  // Madagascar
  {
    name: 'Madagascar',
    points: [
      [43, -12], [50, -15], [50, -22], [47, -25], [43, -22], [43, -12],
    ],
  },
  // Iceland
  {
    name: 'Iceland',
    points: [
      [-24, 63], [-13, 63], [-13, 67], [-22, 66], [-24, 63],
    ],
  },
  // Antarctica (strip at bottom)
  {
    name: 'Antarctica',
    points: [
      [-180, -72], [180, -72], [180, -90], [-180, -90], [-180, -72],
    ],
  },
];

/**
 * Small islands rendered as filled circles. Easier than tiny polygons and
 * keeps Hawaiian / Pacific airports visually on land.
 */
export interface IslandPoint {
  name: string;
  lon: number;
  lat: number;
  /** Visual radius in degrees of latitude. */
  radius: number;
}

export const ISLANDS: IslandPoint[] = [
  // Hawaiian chain
  { name: 'Kauai',         lon: -159.5, lat: 22.05, radius: 0.45 },
  { name: 'Oahu',          lon: -158.0, lat: 21.45, radius: 0.45 },
  { name: 'Molokai',       lon: -157.0, lat: 21.10, radius: 0.30 },
  { name: 'Maui',          lon: -156.4, lat: 20.80, radius: 0.55 },
  { name: 'Big Island',    lon: -155.5, lat: 19.60, radius: 0.85 },
  // Samoa / Tahiti / Pacific outliers
  { name: 'Samoa',         lon: -170.7, lat: -14.30, radius: 0.45 },
  { name: 'Tahiti',        lon: -149.6, lat: -17.55, radius: 0.45 },
  // Caribbean (so flights between NA and SA aren't all over open water)
  { name: 'Cuba',          lon:  -78.0, lat:  21.50, radius: 1.10 },
  { name: 'Hispaniola',    lon:  -71.0, lat:  19.00, radius: 0.80 },
  { name: 'Puerto Rico',   lon:  -66.5, lat:  18.20, radius: 0.45 },
  // Singapore + Malay tip
  { name: 'Singapore',     lon:  103.9, lat:   1.30, radius: 0.45 },
  // Philippines (a few rough blobs)
  { name: 'Luzon',         lon:  121.5, lat:  16.50, radius: 1.00 },
  { name: 'Mindanao',      lon:  125.0, lat:   8.00, radius: 0.95 },
  // Sri Lanka
  { name: 'Sri Lanka',     lon:   80.7, lat:   7.50, radius: 0.65 },
  // Taiwan
  { name: 'Taiwan',        lon:  121.0, lat:  23.80, radius: 0.70 },
];
