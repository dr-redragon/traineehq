import { supabase } from "@/integrations/supabase/client";
import { publicOrigin } from "@/lib/native";
import type {
  ArchivedRegister,
  InvitePreview,
  Plan,
  RegisterBlob,
  RegisterDirectoryEntry,
  RegisterInvite,
  RegisterKind,
  RegisterMember,
  RegisterPerson,
  RegisterRole,
  RegisterStore,
} from "./types";

/** Every call into the register tables and RPCs. Components and hooks get typed functions. */
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

/** The registers this person belongs to. Nobody can see anybody else's. */
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
 * `register_members` lets anyone read their own rows, so this needs no RPC.
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

/** Names and addresses of one register's members, for its other members. */
export async function fetchRegisterPeople(registerId: string): Promise<RegisterPerson[]> {
  const { data, error } = await untyped.rpc("register_people", { _register_id: registerId });
  raise(error);
  return (data ?? []) as RegisterPerson[];
}

// ---------------------------------------------------------------------------
// Writes — all through RPCs, so their rules cannot be sidestepped
// ---------------------------------------------------------------------------

/**
 * Create a register and become its owner.
 *
 * The database refuses a `regular` register to somebody without a
 * subscription; the form checks first only so it can offer the upgrade rather
 * than an error.
 */
export async function createRegister(
  name: string, kind: RegisterKind, organisation?: string,
): Promise<{ id: string; slug: string }> {
  const { data, error } = await untyped.rpc("create_register", {
    _name: name.trim(),
    _kind: kind,
    _organisation: organisation?.trim() || null,
  });
  raise(error);
  return data as { id: string; slug: string };
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

/** The link an invited person opens. The token in it is the invitation. */
export function inviteLink(token: string): string {
  return `${publicOrigin()}/invite/${token}`;
}

export interface InviteResult {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  /** False when no mail provider is configured or the send failed. */
  email_sent: boolean;
}

/**
 * Invite somebody by email.
 *
 * The invitation itself is a database row made by an RPC, so it exists whether
 * or not any email leaves. Sending is a second, best-effort step through an
 * edge function: if it fails the caller still holds a working link to pass on.
 */
export async function inviteToRegister(
  registerId: string, email: string, role: RegisterRole = "editor",
): Promise<InviteResult> {
  const { data, error } = await untyped.rpc("invite_to_register", {
    _register_id: registerId, _email: email, _role: role,
  });
  raise(error);
  const invite = data as Omit<InviteResult, "email_sent">;

  let emailSent = false;
  try {
    const sent = await supabase.functions.invoke("register-invite", {
      body: { invite_id: invite.id },
    });
    emailSent = !sent.error && !!(sent.data as { sent?: boolean } | null)?.sent;
  } catch { /* the link is still good */ }

  return { ...invite, email_sent: emailSent };
}

export async function fetchRegisterInvites(registerId: string): Promise<RegisterInvite[]> {
  const { data, error } = await untyped
    .from("register_invites")
    .select("id, register_id, email, role, token, created_at, expires_at, accepted_at")
    .eq("register_id", registerId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  raise(error);
  return (data ?? []) as RegisterInvite[];
}

export async function revokeRegisterInvite(inviteId: string): Promise<void> {
  const { error } = await untyped.from("register_invites").delete().eq("id", inviteId);
  raise(error);
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  const { data, error } = await untyped.rpc("register_invite_preview", { _token: token });
  raise(error);
  return (data as InvitePreview) ?? null;
}

export async function acceptInvite(token: string): Promise<{ slug: string; name: string }> {
  const { data, error } = await untyped.rpc("accept_register_invite", { _token: token });
  raise(error);
  return data as { slug: string; name: string };
}

/**
 * Accept every invitation addressed to the address this person signed in with.
 * Returns how many registers that added.
 */
export async function claimInvites(): Promise<number> {
  const { data, error } = await untyped.rpc("claim_register_invites");
  raise(error);
  return (data as number) ?? 0;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export async function fetchPlan(): Promise<Plan> {
  const { data, error } = await untyped.rpc("my_plan");
  raise(error);
  return data as Plan;
}

/** Ask a billing function for a Stripe page to send the browser to. */
async function billingUrl(fn: "billing-checkout" | "billing-portal"): Promise<string> {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: {},
  });
  if (error) throw new Error(await functionErrorMessage(error));
  const url = (data as { url?: string; error?: string } | null)?.url;
  if (!url) throw new Error((data as { error?: string } | null)?.error || "Billing is not available right now");
  return url;
}

export const startCheckout = () => billingUrl("billing-checkout");
export const openBillingPortal = () => billingUrl("billing-portal");

/** Delete this account, the registers only it owns, and its subscription. */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) throw new Error(await functionErrorMessage(error));
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
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
