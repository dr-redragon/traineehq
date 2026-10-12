import { supabase } from "@/integrations/supabase/client";
import type {
  ArchivedRegister,
  CreatableDeanery,
  CreatableSpecialty,
  RegisterAccessRequest,
  RegisterBlob,
  RegisterDirectoryEntry,
  RegisterMember,
  RegisterPerson,
  RegisterRole,
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
  delete(): UntypedQuery;
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

/**
 * The caller's own memberships, across every register.
 *
 * `register_members` lets anyone read their own rows, so this needs no RPC and
 * no directory read — it is the cheapest way to ask "do I hold a register".
 */
export async function fetchMyRegisterMemberships(): Promise<RegisterMember[]> {
  // getSession, not getUser: this is the sidebar asking "does this person hold
  // a register", on every page, and getUser is a round trip to the auth server
  // before the one query it gates. The user id only picks the rows to ask for;
  // row-level security decides what comes back.
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session?.user) return [];

  const { data, error } = await untyped
    .from("register_members")
    .select("register_id, user_id, role, granted_by, granted_at")
    .eq("user_id", auth.session.user.id);
  raise(error);
  return (data ?? []) as RegisterMember[];
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
 * Names and addresses for the people connected to one register — its members,
 * and anyone who has asked to join it.
 *
 * Answers only a member of that register, and only about people already
 * connected to it; `profiles` itself stays readable to its owner and to
 * TraineeHQ admins alone.
 */
export async function fetchRegisterPeople(registerId: string): Promise<RegisterPerson[]> {
  const { data, error } = await untyped.rpc("register_people", { _register_id: registerId });
  raise(error);
  return (data ?? []) as RegisterPerson[];
}

/**
 * The deaneries this person may open a register in.
 *
 * Deliberately its own question rather than a filter on `deaneries`: the rule
 * mixes a TraineeHQ role with existing register membership, and answering it
 * client-side would mean reading `user_roles` for everybody.
 */
export async function fetchCreatableDeaneries(): Promise<CreatableDeanery[]> {
  const { data, error } = await untyped.rpc("register_creatable_deaneries");
  raise(error);
  return (data ?? []) as CreatableDeanery[];
}

/**
 * The specialties still open in that deanery — the whole active catalogue, minus
 * the ones already registered there.
 *
 * Not filtered by `specialties.deanery_id`: in practice the catalogue belongs to
 * a single deanery, so doing that would leave every other one with nothing to
 * choose. See 20260907150000.
 */
export async function fetchCreatableSpecialties(
  deaneryId: string,
): Promise<CreatableSpecialty[]> {
  const { data, error } = await untyped.rpc("register_creatable_specialties", {
    _deanery_id: deaneryId,
  });
  raise(error);
  return (data ?? []) as CreatableSpecialty[];
}

// ---------------------------------------------------------------------------
// Writes — all through RPCs, so their rules cannot be sidestepped
// ---------------------------------------------------------------------------

export async function createRegister(
  deaneryId: string, specialtyId: string, name?: string,
): Promise<string> {
  const { data, error } = await untyped.rpc("create_register", {
    _deanery_id: deaneryId,
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

export async function setRegisterMemberRole(
  registerId: string,
  userId: string,
  role: RegisterRole,
): Promise<void> {
  const { error } = await untyped.rpc("set_register_member_role", {
    _register_id: registerId,
    _user_id: userId,
    _role: role,
  });
  raise(error);
}

/** What adding somebody by email came to. */
export interface InviteResult {
  created: boolean;
  email_sent: boolean;
  /** No account, and the caller cannot make one: an account request is needed. */
  needs_account?: boolean;
  suggested_reason?: string;
  specialty_name?: string | null;
  /** An account request was filed for the deanery's admins. */
  requested?: boolean;
}

export interface AccountRequestDetails {
  firstName: string;
  lastName: string;
  reason: string;
}

/**
 * Add somebody by email.
 *
 * Goes through an edge function rather than an RPC because it may need to make
 * an auth user, which needs the service role. The function repeats every rule
 * RLS would have applied, since the service role bypasses them.
 *
 * Somebody with no account: an admin of the register's deanery creates one
 * outright. Anybody else is answered `needs_account`, with a suggested reason;
 * calling again with `request` files an account request for the admins, which
 * on approval adds them here and makes them a facilitator of the specialty.
 */
export async function inviteToRegister(
  registerId: string,
  email: string,
  role: RegisterRole = "editor",
  request?: AccountRequestDetails,
): Promise<InviteResult> {
  const { data, error } = await supabase.functions.invoke("register-invite", {
    body: {
      register_id: registerId,
      email: email.trim().toLowerCase(),
      role,
      redirect_to: `${window.location.origin}/registers`,
      ...(request && {
        request_account: true,
        first_name: request.firstName.trim(),
        last_name: request.lastName.trim(),
        reason: request.reason.trim(),
      }),
    },
  });

  if (error) throw new Error(await functionErrorMessage(error));
  const result = data as InviteResult & { error?: string };
  if (result?.error) throw new Error(result.error);

  return {
    ...result,
    created: !!result?.created,
    email_sent: !!result?.email_sent,
  };
}

/**
 * supabase-js reports a non-2xx answer as "Edge Function returned a non-2xx
 * status code"; the function's own sentence is in the response body.
 */
async function functionErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const res = error.context as Response | undefined;
  try {
    const body = await res?.clone().json();
    if (body?.error) return String(body.error);
  } catch { /* not JSON */ }
  return error.message;
}

export async function removeRegisterMember(registerId: string, userId: string): Promise<void> {
  const { error } = await untyped.rpc("remove_register_member", {
    _register_id: registerId,
    _user_id: userId,
  });
  raise(error);
}

/**
 * Put a register in the archive: out of the directory, out of everyone's way,
 * and recoverable whole until the date this returns.
 */
export async function archiveRegister(registerId: string): Promise<string> {
  const { data, error } = await untyped.rpc("archive_register", { _register_id: registerId });
  raise(error);
  return data as string;
}

/** Take it back out again. Refused by the database once the window has closed. */
export async function restoreRegister(registerId: string): Promise<void> {
  const { error } = await untyped.rpc("restore_register", { _register_id: registerId });
  raise(error);
}

/**
 * The archived registers this person owns. The RPC sweeps expired entries
 * before it answers, so anything returned here can still be restored.
 */
export async function fetchRegisterArchive(): Promise<ArchivedRegister[]> {
  const { data, error } = await untyped.rpc("register_archive");
  raise(error);
  return (data ?? []) as ArchivedRegister[];
}

/**
 * Destroy an archived register now, without waiting out its fifteen days.
 *
 * RLS ("owners delete their archived register") requires `archived_at` to be
 * set, so this cannot reach a live register. Everything hanging off
 * `registers` cascades with it; there is no undo.
 */
export async function deleteRegister(registerId: string): Promise<void> {
  const { error } = await untyped.from("registers").delete().eq("id", registerId);
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

/** One earlier version of a register's data, as `register_history()` lists it. */
export interface RegisterVersion {
  version: number;
  saved_at: string | null;
  saved_by: string | null;
  replaced_at: string;
  replaced_by: string | null;
  counts: { trainees: number; sessions: number; attendance: number };
}

/** The versions an owner can roll back to, newest first. Owners only. */
export async function fetchRegisterHistory(registerId: string): Promise<RegisterVersion[]> {
  const { data, error } = await untyped.rpc("register_history", { _register_id: registerId });
  raise(error);
  return (data ?? []) as RegisterVersion[];
}

/**
 * Put an earlier version back. It is saved as a new version, so the data it
 * replaces goes into the history in turn and the restore can itself be undone.
 */
export async function restoreRegisterVersion(registerId: string, version: number): Promise<number> {
  const { data, error } = await untyped.rpc("restore_register_version", {
    _register_id: registerId, _version: version,
  });
  raise(error);
  return data as number;
}
