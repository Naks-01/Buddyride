import { supabase, auth } from './supabaseClient';

export { auth };

type Row = Record<string, any>;
type Filter = { field: string; value: unknown };
type DocumentSnapshot = { exists: () => boolean; data: () => Row; id: string };
type QuerySnapshot = { docs: DocumentSnapshot[]; empty: boolean; size: number };
type CallbackSnapshot = DocumentSnapshot & QuerySnapshot;

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

function rowSnapshot(row: Row | null): DocumentSnapshot {
  return {
    exists: () => Boolean(row),
    data: () => row ?? {},
    id: row?.id ?? '',
  };
}

async function read(source: any) {
  let request: any = supabase.from(source.table).select('*');
  for (const constraint of source.constraints ?? []) {
    if (constraint.field) request = request.eq(constraint.field, constraint.value);
    if (constraint.orderBy) request = request.order(constraint.orderBy.field, { ascending: constraint.orderBy.direction === 'asc' });
    if (constraint.limit) request = request.limit(constraint.limit);
  }
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

export async function getDoc(reference: any): Promise<DocumentSnapshot> {
  const { data, error } = await supabase.from(reference.table).select('*').eq('id', reference.id).maybeSingle();
  if (error) throw error;
  return rowSnapshot(data);
}

export async function getDocs(source: any): Promise<QuerySnapshot> {
  const rows = await read(source);
  return { docs: rows.map((row: Row) => rowSnapshot(row)), empty: rows.length === 0, size: rows.length };
}

export async function addDoc(reference: any, values: Row) {
  const { data, error } = await supabase.from(reference.table).insert(values).select('id').single();
  if (error) throw error;
  return { id: data.id };
}

export async function setDoc(reference: any, values: Row, options?: { merge?: boolean }) {
  const payload = { ...values, id: reference.id };
  const { error } = options?.merge
    ? await supabase.from(reference.table).upsert(payload)
    : await supabase.from(reference.table).upsert(payload);
  if (error) throw error;
}

export async function updateDoc(reference: any, values: Row) {
  const { data: current, error: readError } = await supabase.from(reference.table).select('*').eq('id', reference.id).maybeSingle();
  if (readError) throw readError;
  const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const normalized = normalize(value);
    if (normalized && typeof normalized === 'object' && '__increment' in normalized) {
      return [key, Number(current?.[key] ?? 0) + Number((normalized as { __increment: number }).__increment)];
    }
    return [key, normalized];
  }));
  const { error } = await supabase.from(reference.table).update(payload).eq('id', reference.id);
  if (error) throw error;
}

export function onSnapshot(source: any, next: (snapshot: CallbackSnapshot) => void, onError?: (error: Error) => void) {
  let stopped = false;
  const emit = async () => {
    try {
      if (source.kind === 'document') next(rowSnapshot((await getDoc(source)).data() ?? null) as CallbackSnapshot);
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