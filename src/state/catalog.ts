// Static catalogs: plane models, cities. Real game has many more — these are
// representative starters. Add freely.

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
  },
  {
    id: 'atr-72',
    name: 'ATR 72-600',
    manufacturer: 'ATR',
    price: 18_000_000,
    seats: 70,
    cargoCapacityKg: 7_500,
    range: 1500,
    speed: 510,
    fuelPerKm: 4.5,
    maintenancePerHour: 100,
    conditionAtPurchase: 1.0,
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
    fuelPerKm: 12.5,
    maintenancePerHour: 280,
    conditionAtPurchase: 1.0,
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
    fuelPerKm: 11.8,
    maintenancePerHour: 290,
    conditionAtPurchase: 1.0,
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
  },
  {
    id: 'q400',
    name: 'Bombardier Q400',
    manufacturer: 'Bombardier',
    price: 30_000_000,
    seats: 78,
    cargoCapacityKg: 8_000,
    range: 2040,
    speed: 670,
    fuelPerKm: 2.4,
    maintenancePerHour: 120,
    conditionAtPurchase: 1.0,
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
