import { isSupabaseConfigured, supabase } from './supabase';

let currentUser: any = null;
if (isSupabaseConfigured) {
  void supabase.auth.getUser().then(({ data }) => { currentUser = data.user; });
  supabase.auth.onAuthStateChange((_event, session) => { currentUser = session?.user ?? null; });
}

export const auth = {
  get currentUser() {
    if (!currentUser) return null;
    return {
      ...currentUser,
      uid: currentUser.id,
      phoneNumber: currentUser.phone ?? null,
      displayName: currentUser.user_metadata?.full_name ?? currentUser.user_metadata?.name ?? null,
      photoURL: currentUser.user_metadata?.avatar_url ?? null,
    };
  },
  getUser: () => supabase.auth.getUser(),
  signOut: () => supabase.auth.signOut(),
};

type Row = Record<string, any>;
type Filter = { field: string; value: unknown };
type DocumentSnapshot = { exists: () => boolean; data: () => Row; id: string };
type QuerySnapshot = { docs: DocumentSnapshot[]; empty: boolean; size: number };
type CallbackSnapshot = DocumentSnapshot & QuerySnapshot;

const RIDE_COLUMN_BY_APP_FIELD: Record<string, string> = {
  driverId: 'driver_id',
  passengerId: 'passenger_id',
  createdAt: 'created_at',
  acceptedAt: 'accepted_at',
  arrivedAt: 'arrived_at',
  startedAt: 'started_at',
  completedAt: 'completed_at',
  cancelledAt: 'cancelled_at',
  cancelledBy: 'cancelled_by',
  cancelReason: 'cancel_reason',
  pickupLat: 'pickup_lat',
  pickupLng: 'pickup_lng',
  dropoffLat: 'dropoff_lat',
  dropoffLng: 'dropoff_lng',
  totalFare: 'total_fare',
  baseFare: 'base_fare',
  bookingFee: 'booking_fee',
  distance: 'distance_km',
  driverName: 'driver_name',
  driverPhone: 'driver_phone',
  driverPhotoUrl: 'driver_photo_url',
  driverCar: 'driver_car',
  driverPlate: 'driver_plate',
  carPlate: 'car_plate',
  driverRating: 'driver_rating',
  driverLat: 'driver_lat',
  driverLng: 'driver_lng',
  driverSpeed: 'driver_speed',
  driverUpdatedAt: 'driver_updated_at',
};

function mapQueryField(table: string, field: string): string {
  if (table === 'profiles') return PROFILE_COLUMN_BY_APP_FIELD[field] ?? field;
  if (table === 'rides') return RIDE_COLUMN_BY_APP_FIELD[field] ?? field;
  return field;
}

const PROFILE_COLUMN_BY_APP_FIELD: Record<string, string> = {
  uid: 'id',
  name: 'full_name',
  createdAt: 'created_at',
  driverStatus: 'driver_status',
  isOnline: 'is_online',
  lastUpdate: 'last_update',
  avgRating: 'avg_rating',
  totalRatings: 'total_ratings',
  ratingCountTotal: 'rating_count_total',
  ratingCount: 'rating_count',
  adminFlag: 'admin_flag',
  totalTips: 'total_tips',
  driverScore: 'driver_score',
  acceptanceRate: 'acceptance_rate',
  idNumberVerified: 'id_number_verified',
  idNumberLast4: 'id_number_last4',
  idNumberHash: 'id_number_hash',
  selfieUrl: 'selfie_url',
  verificationStatus: 'verification_status',
  verifiedAt: 'verified_at',
};

function normalizeProfileRow(row: Row): Row {
  return {
    ...row,
    uid: row.uid ?? row.id,
    name: row.name ?? row.full_name,
    createdAt: row.createdAt ?? row.created_at,
    driverStatus: row.driverStatus ?? row.driver_status,
    isOnline: row.isOnline ?? row.is_online,
    lastUpdate: row.lastUpdate ?? row.last_update,
    avgRating: row.avgRating ?? row.avg_rating,
    totalRatings: row.totalRatings ?? row.total_ratings,
    ratingCountTotal: row.ratingCountTotal ?? row.rating_count_total,
    ratingCount: row.ratingCount ?? row.rating_count,
    adminFlag: row.adminFlag ?? row.admin_flag,
    totalTips: row.totalTips ?? row.total_tips,
    driverScore: row.driverScore ?? row.driver_score,
    acceptanceRate: row.acceptanceRate ?? row.acceptance_rate,
    idNumberVerified: row.idNumberVerified ?? row.id_number_verified,
    idNumberLast4: row.idNumberLast4 ?? row.id_number_last4,
    idNumberHash: row.idNumberHash ?? row.id_number_hash,
    selfieUrl: row.selfieUrl ?? row.selfie_url,
    verificationStatus: row.verificationStatus ?? row.verification_status,
    verifiedAt: row.verifiedAt ?? row.verified_at,
  };
}

function normalizeProfilePayload(values: Row): Row {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => [PROFILE_COLUMN_BY_APP_FIELD[field] ?? field, value]),
  );
}

export const db = {};
export const serverTimestamp = () => new Date().toISOString();
export const increment = (value: number) => ({ __increment: value });

export type DocumentData = Row;
export type Timestamp = { toDate: () => Date };

export function collection(_database: unknown, table: string) {
  return { kind: 'collection' as const, table };
}

export function doc(_databaseOrCollection: unknown, tableOrId?: string, id?: string) {
  if (id === undefined) {
    const source = _databaseOrCollection as { table: string };
    return { kind: 'document' as const, table: source.table, id: tableOrId ?? crypto.randomUUID() };
  }
  return { kind: 'document' as const, table: tableOrId, id };
}

export function query(source: any, ...constraints: any[]) {
  return { ...source, constraints };
}

export function where(field: string, _operator: string, value: unknown): Filter {
  return { field, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { orderBy: { field, direction } };
}

export function limit(value: number) {
  return { limit: value };
}

function normalize(value: unknown) {
  if (value && typeof value === 'object' && '__increment' in value) return value;
  if (value && typeof value === 'object' && 'toDate' in value) return (value as Timestamp).toDate().toISOString();
  return value;
}

const RIDE_STATUS_ALIASES: Record<string, string> = {
  searching: 'pending',
  accepted: 'driver_assigned',
  arriving: 'driver_en_route',
  arrived: 'driver_arrived',
  arrived_at_pickup: 'driver_arrived',
  on_trip: 'trip_started',
};

export function normalizeRideStatus(status: unknown) {
  return typeof status === 'string' ? RIDE_STATUS_ALIASES[status] ?? status : status;
}

function normalizeRideRow(row: Row): Row {
  if (!row) return row;
  const status = normalizeRideStatus(row.status);
  if (!('passenger_id' in row) && !('passengerId' in row)) return { ...row, status };
  return {
    ...row,
    status,
    pickup: row.pickup ?? {
      address: row.pickup_address,
      lat: row.pickup_lat,
      lng: row.pickup_lng,
    },
    dropoff: row.dropoff ?? {
      address: row.dropoff_address,
      lat: row.dropoff_lat,
      lng: row.dropoff_lng,
    },
    pickupLatLng: row.pickupLatLng ?? { lat: row.pickup_lat, lng: row.pickup_lng },
    dropoffLatLng: row.dropoffLatLng ?? { lat: row.dropoff_lat, lng: row.dropoff_lng },
    driverId: row.driverId ?? row.driver_id,
    driverName: row.driverName ?? row.driver_name,
    driverPhone: row.driverPhone ?? row.driver_phone,
    driverPhotoUrl: row.driverPhotoUrl ?? row.driver_photo_url,
    driverCar: row.driverCar ?? row.driver_car,
    driverPlate: row.driverPlate ?? row.driver_plate,
    carPlate: row.carPlate ?? row.car_plate,
    driverRating: row.driverRating ?? row.driver_rating,
    driverLat: row.driverLat ?? row.driver_lat,
    driverLng: row.driverLng ?? row.driver_lng,
    driverSpeed: row.driverSpeed ?? row.driver_speed,
    driverUpdatedAt: row.driverUpdatedAt ?? row.driver_updated_at,
    passengerId: row.passengerId ?? row.passenger_id,
    arrivedAt: row.arrivedAt ?? row.arrived_at,
    cancelledAt: row.cancelledAt ?? row.cancelled_at,
    cancelledBy: row.cancelledBy ?? row.cancelled_by,
    cancelReason: row.cancelReason ?? row.cancel_reason,
    distance: row.distance ?? row.distance_km,
    price: row.price ?? row.total_fare,
    baseFare: row.baseFare ?? row.base_fare,
    bookingFee: row.bookingFee ?? row.booking_fee,
    totalFare: row.totalFare ?? row.total_fare,
    passengerCount: row.passengerCount ?? row.passenger_count,
    extrasFee: row.extrasFee ?? row.extras_fee,
    packageDescription: row.packageDescription ?? row.package_description,
    recipientName: row.recipientName ?? row.recipient_name,
    recipientPhone: row.recipientPhone ?? row.recipient_phone,
    packageSize: row.packageSize ?? row.package_size,
    createdAt: row.createdAt ?? row.created_at,
    startedAt: row.startedAt ?? row.started_at,
    completedAt: row.completedAt ?? row.completed_at,
    pickupWaitSeconds: row.pickupWaitSeconds ?? row.pickup_wait_seconds,
    pickupWaitFare: row.pickupWaitFare ?? row.pickup_wait_fare,
    waitingSeconds: row.waitingSeconds ?? row.waiting_seconds,
    waitingFare: row.waitingFare ?? row.waiting_fare,
  };
}

function rowSnapshot(row: Row | null, table?: string): DocumentSnapshot {
  const normalizedRow = row
    ? table === 'profiles'
      ? normalizeProfileRow(row)
      : normalizeRideRow(row)
    : null;
  return {
    exists: () => Boolean(normalizedRow),
    data: () => normalizedRow ?? {},
    id: normalizedRow?.id ?? '',
  };
}

async function read(source: any, signal?: AbortSignal) {
  let request: any = supabase.from(source.table).select('*');
  if (signal) request = request.abortSignal(signal);
  for (const constraint of source.constraints ?? []) {
    if (constraint.field) request = request.eq(mapQueryField(source.table, constraint.field), constraint.value);
    if (constraint.orderBy) request = request.order(mapQueryField(source.table, constraint.orderBy.field), { ascending: constraint.orderBy.direction === 'asc' });
    if (constraint.limit) request = request.limit(constraint.limit);
  }
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []).map((row: Row) => source.table === 'profiles' ? normalizeProfileRow(row) : normalizeRideRow(row));
}

export async function getDoc(reference: any): Promise<DocumentSnapshot> {
  const { data, error } = await supabase.from(reference.table).select('*').eq('id', reference.id).maybeSingle();
  if (error) throw error;
  return rowSnapshot(data, reference.table);
}

export async function getDocs(source: any, options?: { signal?: AbortSignal }): Promise<QuerySnapshot> {
  const rows = await read(source, options?.signal);
  return { docs: rows.map((row: Row) => rowSnapshot(row)), empty: rows.length === 0, size: rows.length };
}

export async function addDoc(reference: any, values: Row) {
  const payload = reference.table === 'profiles' ? normalizeProfilePayload(values) : values;
  const { data, error } = await supabase.from(reference.table).insert(payload).select('id').single();
  if (error) throw error;
  return { id: data.id };
}

export async function setDoc(reference: any, values: Row, options?: { merge?: boolean }) {
  const valuesWithId = { ...values, id: reference.id };
  const payload = reference.table === 'profiles' ? normalizeProfilePayload(valuesWithId) : valuesWithId;
  const { error } = options?.merge
    ? await supabase.from(reference.table).upsert(payload)
    : await supabase.from(reference.table).upsert(payload);
  if (error) throw error;
}

export async function updateDoc(reference: any, values: Row) {
  const { data: current, error: readError } = await supabase.from(reference.table).select('*').eq('id', reference.id).maybeSingle();
  if (readError) throw readError;
  const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const column = mapQueryField(reference.table, key);
    const normalized = normalize(value);
    if (normalized && typeof normalized === 'object' && '__increment' in normalized) {
      return [column, Number(current?.[column] ?? 0) + Number((normalized as { __increment: number }).__increment)];
    }
    return [column, normalized];
  }));
  const { error } = await supabase.from(reference.table).update(payload).eq('id', reference.id);
  if (error) throw error;
}

export function onSnapshot(source: any, next: (snapshot: CallbackSnapshot) => void, onError?: (error: Error) => void) {
  let stopped = false;
  const emit = async () => {
    try {
      if (source.kind === 'document') next(await getDoc(source) as CallbackSnapshot);
      else next(await getDocs(source) as CallbackSnapshot);
    } catch (error) {
      onError?.(error as Error);
    }
  };
  void emit();
  const timer = window.setInterval(() => { if (!stopped) void emit(); }, 5000);
  return () => { stopped = true; window.clearInterval(timer); };
}

export function writeBatch(_database: unknown) {
  const operations: Promise<void>[] = [];
  return {
    update(reference: any, values: Row) { operations.push(updateDoc(reference, values)); },
    commit: () => Promise.all(operations).then(() => undefined),
  };
}

export async function runTransaction(_database: unknown, callback: (transaction: any) => Promise<void>) {
  const operations: Promise<void>[] = [];
  await callback({
    async get(reference: any) { return getDoc(reference); },
    set(reference: any, values: Row) { operations.push(setDoc(reference, values, { merge: true })); },
    update(reference: any, values: Row) { operations.push(updateDoc(reference, values)); },
  });
  await Promise.all(operations);
}