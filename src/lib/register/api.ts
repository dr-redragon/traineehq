import { supabase } from "@/integrations/supabase/client";
import type {
  CreatableSpecialty,
  RegisterAccessRequest,
  RegisterBlob,
  RegisterDirectoryEntry,
  RegisterMember,
  RegisterStore,
} from "./types";

/**
 * Every call into the register tenancy tables and RPCs.
 *
 * `src/integrations/supabase/types.ts` is generated from the live schema and does
 * not yet know these tables, so each call needs a cast. They are confined to this
 * file — components and hooks get properly typed functions — and once the
 * migrations have been applied and `types.ts` regenerated, the casts here can be
 * deleted without touching anything that calls them.
 */
interface PostgrestFailure {
  message: string;
  hint?: string | null;
}

type UntypedResult = PromiseLike<{ data: unknown; error: PostgrestFailure | null }>;

/** Just the builder methods the calls below actually chain. */
interface UntypedQuery extends UntypedResult {
  select(columns?: string): UntypedQuery;
  eq(column: string, value: unknown): UntypedQuery;
  is(column: string, value: unknown): UntypedQuery;
  order(column: string, options?: { ascending?: boolean }): UntypedQuery;
  maybeSingle(): UntypedQuery;
}

const untyped = supabase as unknown as {
  rpc(fn: string, args?: Record<string, unknown>): UntypedResult;
  from(table: string): UntypedQuery;
};

/**
 * Postgres errors arrive with the message we wrote in the RPC, which is already
 * written for a reader — "You cannot approve your own request for access" rather
 * than a constraint name. Surface it, and keep the hint when there is one.
 */
function raise(error: PostgrestFailure | null): asserts error is null {
  if (!error) return;
  throw new Error(error.hint ? `${error.message}. ${error.hint}` : error.message);
}

/** Thrown when `save_register` rejects a write built on a stale read. */
export class RegisterConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterConflictError";
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every active register, whether or not the caller belongs to it.
 *
 * Names and member counts only. This is what makes "request access" possible at
 * all, so it must not be filtered down to the caller's own registers.
 */
export async function fetchRegisterDirectory(): Promise<RegisterDirectoryEntry[]> {
  const { data, error } = await untyped.rpc("register_directory");
  raise(error);
  return (data ?? []) as RegisterDirectoryEntry[];
}

export async function fetchRegisterStore(registerId: string): Promise<RegisterStore | null> {
  const { data, error } = await untyped
    .from("register_stores")
    .select("register_id, data, version, updated_at, updated_by")
    .eq("register_id", registerId)
    .maybeSingle();
  raise(error);
  return (data as RegisterStore) ?? null;
}

export async function fetchRegisterMembers(registerId: string): Promise<RegisterMember[]> {
  const { data, error } = await untyped
    .from("register_members")
    .select("register_id, user_id, role, granted_by, granted_at")
    .eq("register_id", registerId);
  raise(error);
  return (data ?? []) as RegisterMember[];
}

export async function fetchRegisterRequests(registerId: string): Promise<RegisterAccessRequest[]> {
  const { data, error } = await untyped
    .from("register_access_requests")
    .select("*")
    .eq("register_id", registerId)
    .order("created_at", { ascending: false });
  raise(error);
  return (data ?? []) as RegisterAccessRequest[];
}

/**
 * Specialties the caller could start a register for: ones they can see, that do
 * not have a register already.
 *
 * RLS on `specialties` does the "can see" half — for an admin that is their own
 * deanery, for a trainee the specialties they are enrolled on — which is the same
 * rule `create_register()` enforces server-side. This query only keeps the
 * picker from offering something the RPC would refuse.
 */
export async function fetchCreatableSpecialties(): Promise<CreatableSpecialty[]> {
  const [specialties, registers] = await Promise.all([
    untyped
      .from("specialties")
      .select("id, name, short_name, deanery_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
    untyped.from("registers").select("specialty_id"),
  ]);

  raise(specialties.error);
  raise(registers.error);

  const taken = new Set(
    ((registers.data ?? []) as { specialty_id: string }[]).map((r) => r.specialty_id),
  );

  return ((specialties.data ?? []) as CreatableSpecialty[]).filter((s) => !taken.has(s.id));
}

// ---------------------------------------------------------------------------
// Writes — all through RPCs, so their rules cannot be sidestepped
// ---------------------------------------------------------------------------

export async function createRegister(specialtyId: string, name?: string): Promise<string> {
  const { data, error } = await untyped.rpc("create_register", {
    _specialty_id: specialtyId,
    _name: name?.trim() || null,
  });
  raise(error);
  return data as string;
}

export async function requestRegisterAccess(registerId: string, reason?: string): Promise<string> {
  const { data, error } = await untyped.rpc("request_register_access", {
    _register_id: registerId,
    _reason: reason?.trim() || null,
  });
  raise(error);
  return data as string;
}

export async function decideRegisterAccess(
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<void> {
  const { error } = await untyped.rpc("decide_register_access", {
    _request_id: requestId,
    _approve: approve,
    _note: note?.trim() || null,
  });
  raise(error);
}

export async function removeRegisterMember(registerId: string, userId: string): Promise<void> {
  const { error } = await untyped.rpc("remove_register_member", {
    _register_id: registerId,
    _user_id: userId,
  });
  raise(error);
}

/**
 * Write the register, refusing to clobber a save somebody else made first.
 *
 * `expectedVersion` is the version the edit was built on. If it has moved, this
 * throws `RegisterConflictError` and the caller should re-read, replay the edit
 * onto the newer blob, and try again — rather than retrying blindly, which would
 * reintroduce exactly the lost update the guard exists to prevent.
 */
export async function saveRegister(
  registerId: string,
  data: RegisterBlob,
  expectedVersion: number,
): Promise<number> {
  const { data: version, error } = await untyped.rpc("save_register", {
    _register_id: registerId,
    _data: data as unknown as Record<string, unknown>,
    _expected_version: expectedVersion,
  });

  if (error) {
    if (error.message.includes("saved by somebody else")) {
      throw new RegisterConflictError(error.message);
    }
    raise(error);
  }

  return version as number;
}
