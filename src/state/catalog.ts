// Static catalogs: plane models, cities. Real game has many more — these are
// representative starters. Add freely.

export type PlaneClass = 'turboprop' | 'narrowbody' | 'widebody';

export interface PlaneModel {
  id: string;
  name: string;
  manufacturer: string;
  // Purchase price in $.
  price: number;
  // Max passengers.
  seats: number;
  // Max cargo payload in kg (when flown as a freighter or in belly hold).
  cargoCapacityKg: number;
  // Max range in km on a full tank.
  range: number;
  // Cruise speed km/h.
  speed: number;
  // Liters of fuel per km.
  fuelPerKm: number;
  // Hourly maintenance cost while idle.
  maintenancePerHour: number;
  // Plane age 0-1 (1 = brand new).
  conditionAtPurchase: number;
  // Visual class — drives the on-apron silhouette in AirportScene.makePlaneIcon.
  cls: PlaneClass;
}

export const PLANE_MODELS: PlaneModel[] = [
  {
    id: 'cessna-grand-caravan',
    name: 'Cessna 208 Caravan',
    manufacturer: 'Cessna',
    price: 1_200_000,
    seats: 13,
    cargoCapacityKg: 1_400,
    range: 1900,
    speed: 340,
    fuelPerKm: 0.5,
    maintenancePerHour: 25,
    conditionAtPurchase: 1.0,
    cls: 'turboprop',
  },
  {
    id: 'atr-72',
    name: 'ATR 72-600',
    manufacturer: 'ATR',
    price: 18_000_000,
    seats: 70,
    cargoCapacityKg: 7_500,
    // Real ATR-72-600 is ~1,500 km; bumped to 4,500 km so the plane is a
    // meaningful step up from the Cessna 208 (1,900 km). At its real range
    // it couldn't reach any of HNL's next-tier destinations (Pago Pago
    // 4,200, Papeete 4,400, LAX 4,100, SFO 3,900) — players were forced to
    // jump straight to the $80M A220 to unlock anything beyond the Hawaiian
    // islands.
    range: 4500,
    speed: 510,
    fuelPerKm: 4.5,
    maintenancePerHour: 100,
    conditionAtPurchase: 1.0,
    cls: 'turboprop',
  },
  {
    id: 'b737',
    name: 'Boeing 737-800',
    manufacturer: 'Boeing',
    price: 92_000_000,
    seats: 189,
    cargoCapacityKg: 20_000,
    range: 5400,
    speed: 850,
    // Real B737-800 burns ~3-4 L/km; the previous 12.5 made it strictly worse
    // than the A220-300 (3.5 L/km) on every metric except seat count and
    // turned the plane into a trap purchase. 5.0 keeps it a touch less
    // efficient than A220 (representing the older airframe) while letting
    // its +40 seats over A220 actually translate to higher profit per flight.
    fuelPerKm: 5.0,
    maintenancePerHour: 280,
    conditionAtPurchase: 1.0,
    cls: 'narrowbody',
  },
  {
    id: 'a320',
    name: 'Airbus A320neo',
    manufacturer: 'Airbus',
    price: 110_000_000,
    seats: 195,
    cargoCapacityKg: 21_500,
    range: 6300,
    speed: 870,
    // "neo" = New Engine Option, the most fuel-efficient narrowbody in
    // service. Previous 11.8 L/km was ~4x reality and made the plane
    // pointless next to the cheaper A220. 4.0 puts it slightly worse than
    // the A220 (3.5) but premium-grade — extra seats + range justify the
    // $30M price premium over the A220 and $18M over the B737.
    fuelPerKm: 4.0,
    maintenancePerHour: 290,
    conditionAtPurchase: 1.0,
    cls: 'narrowbody',
  },
  {
    id: 'b747',
    name: 'Boeing 747-400',
    manufacturer: 'Boeing',
    price: 240_000_000,
    seats: 416,
    cargoCapacityKg: 110_000,
    range: 13_450,
    speed: 920,
    fuelPerKm: 22.0,
    maintenancePerHour: 580,
    conditionAtPurchase: 1.0,
    cls: 'widebody',
  },
  {
    id: 'q400',
    name: 'Bombardier Q400',
    manufacturer: 'Bombardier',
    // Dropped from $30M to $25M to give the Q400 a real niche after the ATR
    // range bump. Q400 is now "premium short-haul regional" — +8 seats,
    // ~30% faster, half the fuel burn vs ATR — and ATR is "long-range
    // turboprop workhorse." Each makes sense for different route lengths.
    price: 25_000_000,
    seats: 78,
    cargoCapacityKg: 8_000,
    range: 2040,
    speed: 670,
    fuelPerKm: 2.4,
    maintenancePerHour: 120,
    conditionAtPurchase: 1.0,
    cls: 'turboprop',
  },
  {
    id: 'a220',
    name: 'Airbus A220-300',
    manufacturer: 'Airbus',
    price: 80_000_000,
    seats: 149,
    cargoCapacityKg: 14_000,
    range: 6700,
    speed: 870,
    fuelPerKm: 3.5,
    maintenancePerHour: 240,
    conditionAtPurchase: 1.0,
    cls: 'narrowbody',
  },
  {
    id: 'a321neo',
    name: 'Airbus A321neo',
    manufacturer: 'Airbus',
    price: 130_000_000,
    seats: 220,
    cargoCapacityKg: 22_000,
    range: 7_400,
    speed: 870,
    fuelPerKm: 4.5,
    maintenancePerHour: 310,
    conditionAtPurchase: 1.0,
    cls: 'narrowbody',
  },
  {
    id: 'b787',
    name: 'Boeing 787-9 Dreamliner',
    manufacturer: 'Boeing',
    price: 290_000_000,
    seats: 296,
    cargoCapacityKg: 45_000,
    range: 14_140,
    speed: 903,
    fuelPerKm: 11.5,
    maintenancePerHour: 480,
    conditionAtPurchase: 1.0,
    cls: 'widebody',
  },
  {
    id: 'a350',
    name: 'Airbus A350-900',
    manufacturer: 'Airbus',
    price: 320_000_000,
    seats: 325,
    cargoCapacityKg: 51_000,
    range: 15_000,
    speed: 903,
    fuelPerKm: 12.0,
    maintenancePerHour: 510,
    conditionAtPurchase: 1.0,
    cls: 'widebody',
  },
  {
    id: 'b777',
    name: 'Boeing 777-300ER',
    manufacturer: 'Boeing',
    price: 360_000_000,
    seats: 396,
    cargoCapacityKg: 64_000,
    range: 13_650,
    speed: 905,
    fuelPerKm: 14.5,
    maintenancePerHour: 560,
    conditionAtPurchase: 1.0,
    cls: 'widebody',
  },
  {
    id: 'a380',
    name: 'Airbus A380-800',
    manufacturer: 'Airbus',
    price: 445_000_000,
    seats: 555,
    cargoCapacityKg: 51_000,
    range: 14_800,
    speed: 945,
    fuelPerKm: 17.0,
    maintenancePerHour: 720,
    conditionAtPurchase: 1.0,
    cls: 'widebody',
  },
  // ----- Dedicated freighters. seats: 0 makes them useless on passenger
  // routes (zero revenue), so the player only opens cargo contracts with
  // them. Cargo capacity is what they're for — much higher than the
  // passenger variants' belly-hold numbers. -----
  {
    id: 'atr-72f',
    name: 'ATR 72-600F',
    manufacturer: 'ATR',
    price: 22_000_000,
    seats: 0,
    cargoCapacityKg: 9_000,
    range: 3_500,
    speed: 510,
    fuelPerKm: 4.0,
    maintenancePerHour: 95,
    conditionAtPurchase: 1.0,
    cls: 'turboprop',
  },
  {
    id: 'a330-200f',
    name: 'Airbus A330-200F',
    manufacturer: 'Airbus',
    price: 220_000_000,
    seats: 0,
    cargoCapacityKg: 70_000,
    range: 7_400,
    speed: 870,
    fuelPerKm: 14.0,
    maintenancePerHour: 470,
    conditionAtPurchase: 1.0,
    cls: 'widebody',
  },
  {
    id: 'b747-400f',
    name: 'Boeing 747-400F',
    manufacturer: 'Boeing',
    price: 280_000_000,
    seats: 0,
    cargoCapacityKg: 113_000,
    range: 8_200,
    speed: 920,
    fuelPerKm: 22.0,
    maintenancePerHour: 600,
    conditionAtPurchase: 1.0,
    cls: 'widebody',
  },
];

export interface CityData {
  id: string;
  name: string;
  country: string;
  // Lat / Lon for great-circle distance.
  lat: number;
  lon: number;
  // Demand multiplier for default ticket price (richer/larger cities pay more).
  demand: number;
}

export const CITIES: CityData[] = [
  { id: 'hnl', name: 'Honolulu',     country: 'USA',     lat: 21.32, lon: -157.92, demand: 1.0 },
  { id: 'ogg', name: 'Maui',         country: 'USA',     lat: 20.90, lon: -156.43, demand: 0.8 },
  { id: 'koa', name: 'Kona',         country: 'USA',     lat: 19.74, lon: -156.05, demand: 0.7 },
  { id: 'ito', name: 'Hilo',         country: 'USA',     lat: 19.72, lon: -155.05, demand: 0.6 },
  { id: 'lih', name: 'Kauai',        country: 'USA',     lat: 21.98, lon: -159.34, demand: 0.7 },
  { id: 'ppg', name: 'Pago Pago',    country: 'Samoa',   lat:-14.33, lon: -170.71, demand: 0.6 },
  { id: 'pap', name: 'Papeete',      country: 'Tahiti',  lat:-17.55, lon: -149.61, demand: 0.7 },
  { id: 'lax', name: 'Los Angeles',  country: 'USA',     lat: 33.94, lon: -118.41, demand: 1.3 },
  { id: 'sfo', name: 'San Francisco',country: 'USA',     lat: 37.62, lon: -122.38, demand: 1.3 },
  { id: 'sea', name: 'Seattle',      country: 'USA',     lat: 47.45, lon: -122.31, demand: 1.1 },
  { id: 'jfk', name: 'New York',     country: 'USA',     lat: 40.64, lon:  -73.78, demand: 1.5 },
  { id: 'mex', name: 'Mexico City',  country: 'Mexico',  lat: 19.43, lon:  -99.07, demand: 0.9 },
  { id: 'lhr', name: 'London',       country: 'UK',      lat: 51.47, lon:   -0.45, demand: 1.5 },
  { id: 'cdg', name: 'Paris',        country: 'France',  lat: 49.01, lon:    2.55, demand: 1.4 },
  { id: 'fra', name: 'Frankfurt',    country: 'Germany', lat: 50.04, lon:    8.56, demand: 1.3 },
  { id: 'nrt', name: 'Tokyo',        country: 'Japan',   lat: 35.77, lon:  140.39, demand: 1.4 },
  { id: 'syd', name: 'Sydney',       country: 'Australia',lat:-33.94,lon:  151.18, demand: 1.2 },
  { id: 'sin', name: 'Singapore',    country: 'Singapore',lat:  1.36,lon:  103.99, demand: 1.3 },
  { id: 'dxb', name: 'Dubai',        country: 'UAE',     lat: 25.25, lon:   55.36, demand: 1.4 },
  { id: 'gru', name: 'Sao Paulo',    country: 'Brazil',  lat:-23.43, lon:  -46.48, demand: 1.0 },
  { id: 'jnb', name: 'Johannesburg', country: 'S. Africa',lat:-26.13,lon:   28.24, demand: 0.9 },
  // ----- Expansion set: secondary hubs across continents. -----
  { id: 'ord', name: 'Chicago',      country: 'USA',     lat: 41.98, lon:  -87.91, demand: 1.3 },
  { id: 'mia', name: 'Miami',        country: 'USA',     lat: 25.79, lon:  -80.29, demand: 1.2 },
  { id: 'yyz', name: 'Toronto',      country: 'Canada',  lat: 43.68, lon:  -79.63, demand: 1.1 },
  { id: 'mad', name: 'Madrid',       country: 'Spain',   lat: 40.49, lon:   -3.57, demand: 1.2 },
  { id: 'fco', name: 'Rome',         country: 'Italy',   lat: 41.80, lon:   12.25, demand: 1.2 },
  { id: 'ist', name: 'Istanbul',     country: 'Turkey',  lat: 41.27, lon:   28.74, demand: 1.2 },
  { id: 'bom', name: 'Mumbai',       country: 'India',   lat: 19.09, lon:   72.87, demand: 1.1 },
  { id: 'pek', name: 'Beijing',      country: 'China',   lat: 40.08, lon:  116.59, demand: 1.3 },
  { id: 'hkg', name: 'Hong Kong',    country: 'China',   lat: 22.31, lon:  113.91, demand: 1.3 },
  { id: 'icn', name: 'Seoul',        country: 'S. Korea',lat: 37.46, lon:  126.44, demand: 1.2 },
  // ----- Expansion set 2 (2026-05-14): fill regional gaps. -----
  // North America interior + east coast
  { id: 'atl', name: 'Atlanta',      country: 'USA',     lat: 33.64, lon:  -84.43, demand: 1.4 },
  { id: 'den', name: 'Denver',       country: 'USA',     lat: 39.86, lon: -104.67, demand: 1.2 },
  { id: 'bos', name: 'Boston',       country: 'USA',     lat: 42.36, lon:  -71.01, demand: 1.2 },
  { id: 'iah', name: 'Houston',      country: 'USA',     lat: 29.98, lon:  -95.34, demand: 1.2 },
  { id: 'yvr', name: 'Vancouver',    country: 'Canada',  lat: 49.19, lon: -123.18, demand: 1.1 },
  // South America
  { id: 'eze', name: 'Buenos Aires', country: 'Argentina',lat:-34.82, lon: -58.54, demand: 1.1 },
  { id: 'bog', name: 'Bogotá',       country: 'Colombia',lat:  4.70, lon:  -74.14, demand: 1.0 },
  // Europe + Middle East
  { id: 'ams', name: 'Amsterdam',    country: 'Netherlands',lat:52.31,lon:    4.76, demand: 1.4 },
  { id: 'muc', name: 'Munich',       country: 'Germany', lat: 48.35, lon:   11.79, demand: 1.3 },
  { id: 'doh', name: 'Doha',         country: 'Qatar',   lat: 25.27, lon:   51.61, demand: 1.3 },
  // Asia-Pacific
  { id: 'bkk', name: 'Bangkok',      country: 'Thailand',lat: 13.69, lon:  100.75, demand: 1.3 },
  { id: 'del', name: 'Delhi',        country: 'India',   lat: 28.57, lon:   77.10, demand: 1.3 },
  { id: 'tpe', name: 'Taipei',       country: 'Taiwan',  lat: 25.08, lon:  121.23, demand: 1.2 },
  { id: 'kul', name: 'Kuala Lumpur', country: 'Malaysia',lat:  2.74, lon:  101.71, demand: 1.2 },
  // Oceania + Africa
  { id: 'mel', name: 'Melbourne',    country: 'Australia',lat:-37.67,lon:  144.84, demand: 1.2 },
  { id: 'akl', name: 'Auckland',     country: 'New Zealand',lat:-37.01,lon:174.79, demand: 1.1 },
  { id: 'cpt', name: 'Cape Town',    country: 'S. Africa',lat:-33.97,lon:   18.60, demand: 1.0 },
  // ----- Expansion set 3 (2026-05-14): major US international airports. -----
  // Big hubs first (mega airline hubs with serious international service)
  { id: 'dfw', name: 'Dallas-Fort Worth',country:'USA',lat: 32.90, lon:  -97.04, demand: 1.4 },
  { id: 'clt', name: 'Charlotte',    country: 'USA',     lat: 35.21, lon:  -80.94, demand: 1.2 },
  { id: 'iad', name: 'Washington Dulles',country:'USA', lat: 38.95, lon:  -77.46, demand: 1.2 },
  { id: 'phl', name: 'Philadelphia', country: 'USA',     lat: 39.87, lon:  -75.24, demand: 1.2 },
  { id: 'ewr', name: 'Newark',       country: 'USA',     lat: 40.69, lon:  -74.17, demand: 1.3 },
  { id: 'phx', name: 'Phoenix',      country: 'USA',     lat: 33.43, lon: -112.01, demand: 1.2 },
  { id: 'mco', name: 'Orlando',      country: 'USA',     lat: 28.43, lon:  -81.31, demand: 1.2 },
  { id: 'las', name: 'Las Vegas',    country: 'USA',     lat: 36.08, lon: -115.15, demand: 1.2 },
  { id: 'msp', name: 'Minneapolis',  country: 'USA',     lat: 44.88, lon:  -93.22, demand: 1.1 },
  { id: 'dtw', name: 'Detroit',      country: 'USA',     lat: 42.21, lon:  -83.35, demand: 1.1 },
  { id: 'slc', name: 'Salt Lake City',country:'USA',    lat: 40.79, lon: -111.98, demand: 1.1 },
  // Mid-tier regional hubs
  { id: 'san', name: 'San Diego',    country: 'USA',     lat: 32.73, lon: -117.19, demand: 1.0 },
  { id: 'tpa', name: 'Tampa',        country: 'USA',     lat: 27.97, lon:  -82.53, demand: 1.0 },
  { id: 'bwi', name: 'Baltimore',    country: 'USA',     lat: 39.18, lon:  -76.67, demand: 1.0 },
  { id: 'pdx', name: 'Portland',     country: 'USA',     lat: 45.59, lon: -122.60, demand: 1.0 },
  { id: 'aus', name: 'Austin',       country: 'USA',     lat: 30.19, lon:  -97.67, demand: 1.0 },
  // Distinctive geographic outliers (Pacific + Caribbean)
  { id: 'anc', name: 'Anchorage',    country: 'USA',     lat: 61.17, lon: -149.99, demand: 0.9 },
  { id: 'sju', name: 'San Juan',     country: 'Puerto Rico',lat:18.44,lon: -66.00, demand: 0.9 },
];

// Great-circle distance in km.
export function distanceKm(a: CityData, b: CityData): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function getPlaneModel(id: string): PlaneModel {
  const m = PLANE_MODELS.find(p => p.id === id);
  if (!m) throw new Error(`Unknown plane model: ${id}`);
  return m;
}

export function getCity(id: string): CityData {
  const c = CITIES.find(x => x.id === id);
  if (!c) throw new Error(`Unknown city: ${id}`);
  return c;
}

// Default airline names (homage to original). Each airline now gets a distinct
// home airport so AI rivals don't all dogpile Honolulu.
export const DEFAULT_AIRLINES = [
  { id: 'honey',   name: 'Honey Air',       color: 0xffc857, home: 'hnl' },
  { id: 'falcon',  name: 'Falcon Lines',    color: 0x66ccee, home: 'lax' },
  { id: 'phoenix', name: 'Phoenix Airlines',color: 0xff6644, home: 'jfk' },
  { id: 'tucan',   name: 'Tucan Airlines',  color: 0x77dd66, home: 'lhr' },
];

// Home airport for the human's campaign (original game is set in Honolulu).
export const HOME_AIRPORT = 'hnl';
