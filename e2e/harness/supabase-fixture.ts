/**
 * A stand-in for the Supabase client, holding one cohort's worth of invented data.
 *
 * The signed-in pages cannot otherwise be looked at: every one of them reads
 * from Supabase behind sign-in, so a screenshot of the dashboard, a specialty
 * or a discussion board needs either real credentials and real patient-adjacent
 * data, or this. The preview harness aliases `@/integrations/supabase/client`
 * onto this module (see vite.preview.config.ts), so the pages themselves are
 * the real ones — same components, same queries, same rendering — and only the
 * rows underneath are invented.
 *
 * Dev-server only, and only under the preview config: `vite build` builds
 * index.html and nothing else, so none of this reaches a bundle.
 *
 * Every name, hospital and message below is made up. Nothing here is a real
 * person or a real trainee's data.
 */

// `is_active` matters now that the fixture's `eq` filters for real: the
// deanery provider asks for active deaneries only, and without the column the
// whole app fell back to "no deanery" — an empty rail and no specialties.
const DEANERY = { id: "dny-1", name: "North West", slug: "north-west", is_active: true };

const SPECIALTIES = [
  { id: "sp-1", name: "Otolaryngology", short_name: "ENT", icon_name: "Stethoscope", color: "8 85% 50%", parent_specialty_id: null, sort_order: 1, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  { id: "sp-2", name: "Trauma & Orthopaedics", short_name: "T&O", icon_name: "Bone", color: "20 5% 12%", parent_specialty_id: null, sort_order: 2, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  { id: "sp-3", name: "General Surgery", short_name: "Gen Surg", icon_name: "Scissors", color: "0 2% 37%", parent_specialty_id: null, sort_order: 3, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  { id: "sp-4", name: "Upper GI", short_name: "Upper GI", icon_name: "Activity", color: "0 2% 48%", parent_specialty_id: "sp-3", sort_order: 4, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  { id: "sp-5", name: "Colorectal", short_name: "Colorectal", icon_name: "Activity", color: "0 2% 48%", parent_specialty_id: "sp-3", sort_order: 5, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  { id: "sp-6", name: "Vascular Surgery", short_name: "Vascular", icon_name: "HeartPulse", color: "8 87% 46%", parent_specialty_id: "sp-3", sort_order: 6, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  { id: "sp-7", name: "Paediatric Surgery", short_name: "Paeds", icon_name: "Baby", color: "0 2% 60%", parent_specialty_id: null, sort_order: 7, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  { id: "sp-8", name: "Urology", short_name: "Urology", icon_name: "Droplet", color: "0 2% 37%", parent_specialty_id: null, sort_order: 8, deanery_id: DEANERY.id, is_active: true, deleted_at: null },
  // Withdrawn by an admin: still in the table, still readable to the people
  // assigned to it, and deliberately absent from the rail, the search box and
  // its own page. It is here so the preview demonstrates that rather than
  // leaving it to a unit test.
  { id: "sp-9", name: "Ophthalmology", short_name: "Ophthalmology", icon_name: "Eye", color: "0 2% 37%", parent_specialty_id: null, sort_order: 9, deanery_id: DEANERY.id, is_active: false, deleted_at: null },
];

const SUBSECTIONS = [
  { id: "sub-1", specialty_id: "sp-1", name: "Curriculum", sort_order: 1 },
  { id: "sub-2", specialty_id: "sp-1", name: "Operative Videos", sort_order: 2 },
  { id: "sub-3", specialty_id: "sp-1", name: "FRCS Preparation", sort_order: 3 },
  { id: "sub-4", specialty_id: "sp-1", name: "Guidelines", sort_order: 4 },
  { id: "sub-5", specialty_id: "sp-1", name: "Audit & QI", sort_order: 5 },
  { id: "sub-6", specialty_id: "sp-9", name: "Cataract Surgery", sort_order: 1 },
];

const specOf = (id: string) => SPECIALTIES.find((s) => s.id === id);

const RESOURCES = [
  { id: "r-1", title: "JCST Curriculum 2026 — ENT", resource_type: "pdf", subsection_id: "sub-1", created_at: "2026-09-02T09:00:00Z", description: "The current curriculum, with the 2026 amendments marked up.", url: null, file_path: null, folder_id: null, file_size: 2517000, updated_at: "2026-09-14T09:00:00Z" },
  { id: "r-2", title: "Grommet insertion — step by step", resource_type: "video", subsection_id: "sub-2", created_at: "2026-08-28T09:00:00Z", description: "Recorded at a regional teaching day.", url: null, file_path: null, folder_id: null, file_size: 88000, updated_at: "2026-09-10T09:00:00Z" },
  { id: "r-3", title: "Section 1 question bank", resource_type: "link", subsection_id: "sub-3", created_at: "2026-08-21T09:00:00Z", description: null, url: "https://example.invalid/bank", file_path: null, folder_id: null, file_size: null, updated_at: "2026-09-16T09:00:00Z" },
  { id: "r-4", title: "ENT UK tonsillectomy guideline", resource_type: "document", subsection_id: "sub-4", created_at: "2026-08-14T09:00:00Z", description: null, url: null, file_path: null, folder_id: null, file_size: 317000, updated_at: "2026-09-05T09:00:00Z" },
  { id: "r-5", title: "Regional audit template", resource_type: "checklist", subsection_id: "sub-5", created_at: "2026-08-06T09:00:00Z", description: null, url: null, file_path: null, folder_id: null, file_size: 47000, updated_at: "2026-08-20T09:00:00Z" },
  // In the withdrawn specialty, and so unfindable. Its title shares the word
  // "audit" with r-5 above, which is the point: searching "audit" must return
  // the one and not the other.
  { id: "r-6", title: "Cataract audit template", resource_type: "checklist", subsection_id: "sub-6", created_at: "2026-08-06T09:00:00Z", description: null, url: null, file_path: null, folder_id: null, file_size: 51000, updated_at: "2026-08-20T09:00:00Z" },
];

const withSub = (r: (typeof RESOURCES)[number]) => {
  const sub = SUBSECTIONS.find((s) => s.id === r.subsection_id);
  const spec = sub ? specOf(sub.specialty_id) : undefined;
  return { ...r, subsections: sub ? { specialty_id: sub.specialty_id, specialties: { short_name: spec?.short_name ?? "" } } : null };
};

const DISCUSSIONS = [
  { id: "d-1", title: "How are people finding the new logbook requirements?", content: "The 2026 curriculum asks for indicative numbers by ST6 rather than at CCT. Has anyone had this come up at ARCP yet, and did your TPD take the old or the new reading?", specialty_id: "sp-1", author_id: "u-2", created_at: "2026-09-16T10:12:00Z", is_pinned: true },
  { id: "d-2", title: "Regional teaching — September dates confirmed", content: "The next three teaching days are the second Wednesday of each month at the postgraduate centre. Register links go out a fortnight ahead.", specialty_id: "sp-1", author_id: "u-3", created_at: "2026-09-15T16:40:00Z", is_pinned: false },
  { id: "d-3", title: "FRCS Section 2 — what actually came up", content: "Sat it last week. Happy to share what the stations looked like, minus anything under the confidentiality agreement.", specialty_id: "sp-1", author_id: "u-4", created_at: "2026-09-11T08:05:00Z", is_pinned: false },
  { id: "d-4", title: "Anyone got a good template for the QI project write-up?", content: "Starting my second cycle and the deanery proforma is not much help on the analysis section.", specialty_id: "sp-1", author_id: "u-5", created_at: "2026-09-04T19:22:00Z", is_pinned: false },
];

const COMMENTS = [
  { id: "c-1", discussion_id: "d-1", parent_comment_id: null, content: "Came up at mine in July. My TPD read it as ST6, but said they would not fail anyone on it this year while the guidance settles.", author_id: "u-3", created_at: "2026-09-16T11:30:00Z" },
  { id: "c-2", discussion_id: "d-1", parent_comment_id: "c-1", content: "Same here — worth getting it in writing in your ARCP outcome form either way.", author_id: "u-4", created_at: "2026-09-16T12:02:00Z" },
  { id: "c-3", discussion_id: "d-1", parent_comment_id: null, content: "The college FAQ was updated last month and is clearer than the curriculum document itself.", author_id: "u-5", created_at: "2026-09-17T07:45:00Z" },
];

const PROFILES = [
  { user_id: "u-1", first_name: "Sam", last_name: "Whitfield", deanery_id: DEANERY.id, email: "sam.whitfield@example.invalid", created_at: "2024-08-01T09:00:00Z" },
  { user_id: "u-2", first_name: "Priya", last_name: "Raghavan", deanery_id: DEANERY.id, email: "priya.raghavan@example.invalid", created_at: "2025-02-01T09:00:00Z" },
  { user_id: "u-3", first_name: "Tom", last_name: "Okonkwo", deanery_id: DEANERY.id, email: "tom.okonkwo@example.invalid", created_at: "2025-03-01T09:00:00Z" },
  { user_id: "u-4", first_name: "Elin", last_name: "Davies", deanery_id: DEANERY.id, email: "elin.davies@example.invalid", created_at: "2025-04-01T09:00:00Z" },
  { user_id: "u-5", first_name: "Marcus", last_name: "Bell", deanery_id: DEANERY.id, email: "marcus.bell@example.invalid", created_at: "2025-05-01T09:00:00Z" },
];

const CONTACTS = [
  { id: "ct-1", name: "Ms Helena Frost", role: "Training Programme Director", organisation: "North West Deanery", email: "tpd@example.invalid", phone: null, category: "Programme", specialty_id: "sp-1", notes: null, archived: false },
  { id: "ct-2", name: "Mr Idris Kanu", role: "College Tutor", organisation: "Royal Infirmary", email: "tutor@example.invalid", phone: null, category: "Programme", specialty_id: "sp-1", notes: null, archived: false },
  { id: "ct-3", name: "Dr Anna Beaumont", role: "Simulation Lead", organisation: "Postgraduate Centre", email: "sim@example.invalid", phone: null, category: "Education", specialty_id: "sp-1", notes: null, archived: false },
  // No specialty: the general directory, which everyone signed in is meant to
  // find. It is here so the search's visibility filter is shown keeping these
  // rather than treating a missing specialty as something to hide.
  { id: "ct-4", name: "Ms Rowan Pike", role: "Deanery Audit Coordinator", organisation: "North West Deanery", email: "audit@example.invalid", phone: null, category: "Programme", specialty_id: null, notes: null, archived: false },
  // In the withdrawn specialty, so it must not be findable.
  { id: "ct-5", name: "Mr Silas Verity", role: "Cataract Service Lead", organisation: "Eye Hospital", email: "eye@example.invalid", phone: null, category: "Education", specialty_id: "sp-9", notes: null, archived: false },
];

const TABLES: Record<string, unknown[]> = {
  deaneries: [DEANERY],
  specialties: SPECIALTIES,
  subsections: SUBSECTIONS,
  resources: RESOURCES.map(withSub),
  discussions: DISCUSSIONS,
  discussion_comments: COMMENTS,
  discussion_votes: [
    { id: "v-1", discussion_id: "d-1", comment_id: null, user_id: "u-2", vote_type: 1 },
    { id: "v-2", discussion_id: "d-1", comment_id: null, user_id: "u-3", vote_type: 1 },
    { id: "v-3", discussion_id: "d-1", comment_id: null, user_id: "u-4", vote_type: 1 },
    { id: "v-4", discussion_id: "d-2", comment_id: null, user_id: "u-2", vote_type: 1 },
    { id: "v-5", discussion_id: "d-3", comment_id: null, user_id: "u-5", vote_type: 1 },
  ],
  profiles: PROFILES,
  contacts: CONTACTS,
  user_roles: [{ user_id: "u-1", role: "admin" }],
  announcements: [
    { id: "a-1", title: "ARCP submissions close on 30 September", content: "Evidence uploaded after the deadline will not be seen by the panel. If you are short of a WBA, speak to your educational supervisor this week rather than on the day.", is_active: true, created_at: "2026-09-14T09:00:00Z", deanery_id: DEANERY.id },
  ],
  bookmarks: [
    { id: "b-1", user_id: "u-1", created_at: "2026-09-10T09:00:00Z", resources: withSub(RESOURCES[0]) },
    { id: "b-2", user_id: "u-1", created_at: "2026-09-08T09:00:00Z", resources: withSub(RESOURCES[2]) },
    { id: "b-3", user_id: "u-1", created_at: "2026-09-01T09:00:00Z", resources: withSub(RESOURCES[3]) },
  ],
  watched_discussions: [
    { id: "w-1", user_id: "u-1", discussion_id: "d-1", created_at: "2026-09-16T12:00:00Z", discussions: { id: "d-1", title: DISCUSSIONS[0].title, specialty_id: "sp-1", created_at: DISCUSSIONS[0].created_at, specialties: { short_name: "ENT" } } },
    { id: "w-2", user_id: "u-1", discussion_id: "d-3", created_at: "2026-09-12T12:00:00Z", discussions: { id: "d-3", title: DISCUSSIONS[2].title, specialty_id: "sp-1", created_at: DISCUSSIONS[2].created_at, specialties: { short_name: "ENT" } } },
  ],
  starred_contacts: [
    { id: "s-1", user_id: "u-1", created_at: "2026-09-01T09:00:00Z", contacts: CONTACTS[0] },
    { id: "s-2", user_id: "u-1", created_at: "2026-09-01T09:00:00Z", contacts: CONTACTS[1] },
  ],
  dashboard_preferences: [
    {
      user_id: "u-1",
      widget_layout: ["specialties", "registers", "bookmarks", "recent_resources", "watched_discussions", "contacts"],
      hidden_widgets: ["file_browser"],
      columns: 2,
      right_column_widgets: ["bookmarks", "watched_discussions", "contacts"],
      widget_settings: {},
    },
  ],
  folders: [],
  specialty_notices: [
    { id: "n-1", specialty_id: "sp-1", content: "The October teaching day has moved to the Lecture Theatre B.", created_at: "2026-09-13T09:00:00Z", author_id: "u-3" },
  ],
};

/**
 * A query builder that accepts the whole chain and ignores the filters.
 *
 * The pages compose `.select().eq().is().order().limit()` in many
 * combinations, and for a screenshot it does not matter which rows come back —
 * only that a plausible set does. So every filter is a no-op returning `this`,
 * and awaiting the builder resolves with the table.
 */
type Row = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

/**
 * Turn a PostgREST filter argument back into a plain search term.
 *
 * The app builds these with `orIlikePattern`, which quotes the whole pattern
 * and backslash-escapes any `%` or `_` the person actually typed — so what
 * arrives here looks like `"%urol%"`, quotes and all. Stripping only the `%`
 * left the quotes in the needle, and nothing ever matched.
 */
function unwrapPattern(raw: string) {
  let v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v.replace(/\\(.)/g, "$1").replace(/[%*]/g, "").toLowerCase();
}

function matchesPattern(value: unknown, pattern: string) {
  const needle = unwrapPattern(pattern);
  return needle === "" || text(value).includes(needle);
}

/**
 * `col.ilike."%foo%",other.ilike."%foo%"` — PostgREST's OR syntax, the subset
 * the app actually writes. Clauses are pulled out with a regex rather than by
 * splitting on commas, because both a quoted term and an `in.(a,b)` list are
 * allowed to contain one.
 */
const CLAUSE_RE = /([a-z_]+)\.([a-z]+)\.("(?:[^"\\]|\\.)*"|\([^)]*\)|[^,]*)/gi;

/** `(a,b,c)` as written in an `in.` clause. */
function parseList(arg: string): string[] {
  return arg.trim().replace(/^\(|\)$/g, "").split(",").map((v) => unwrapPattern(v)).filter(Boolean);
}

function matchesOr(row: Row, expr: string) {
  const clauses = [...expr.matchAll(CLAUSE_RE)];
  return clauses.some(([, col, op, arg]) => {
    if (op === "ilike" || op === "like") return matchesPattern(row[col], arg);
    if (op === "eq") return String(row[col]) === unwrapPattern(arg);
    // Both of these arrived with the search's visibility scope: a contact is
    // shown when it belongs to a specialty in scope, or to none at all.
    if (op === "is") return arg.trim() === "null" ? row[col] == null : false;
    if (op === "in") return row[col] != null && parseList(arg).includes(String(row[col]));
    return false;
  });
}

/**
 * A query builder that filters for real, within reason.
 *
 * It started as a chain of no-ops returning the whole table, which was fine
 * while the preview only had to render a page. It stopped being fine once the
 * search box moved into the header: with every filter ignored, typing "curr"
 * listed every specialty in the fixture, so the one thing the preview was
 * meant to demonstrate was the one thing it could not show honestly.
 *
 * So `eq`, `is`, `in`, `ilike` and `or` narrow the rows, and `order` and
 * `limit` shape them. Everything else still returns `this`. This is a stand-in
 * for a screenshot, not a database — it does not join, and `select()`'s column
 * list is ignored, because the fixture rows are already the shape the pages
 * expect.
 */
/**
 * A column, or a column inside an embedded table.
 *
 * PostgREST filters an embedded resource by its path — `subsections.specialty_id`
 * on a resources query — and the search relies on that to keep files in a
 * withdrawn section from being sent at all. Reading the path here is what makes
 * the preview behave the same way; a plain key lookup would find nothing and
 * silently drop every row.
 */
function valueAt(row: Row, path: string): unknown {
  if (!path.includes(".")) return row[path];
  return path.split(".").reduce<unknown>(
    (value, key) =>
      value && typeof value === "object" ? (value as Row)[key] : undefined,
    row,
  );
}

function builder(table: string) {
  let rows = [...((TABLES[table] ?? []) as Row[])];

  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    csv: () => Promise.resolve({ data: "", error: null }),

    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => valueAt(r, col) === val || String(valueAt(r, col)) === String(val));
      return chain;
    },
    neq: (col: string, val: unknown) => {
      rows = rows.filter((r) => String(r[col]) !== String(val));
      return chain;
    },
    is: (col: string, val: unknown) => {
      rows = rows.filter((r) => (val === null ? valueAt(r, col) == null : valueAt(r, col) === val));
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(valueAt(r, col)));
      return chain;
    },
    ilike: (col: string, pattern: string) => {
      rows = rows.filter((r) => matchesPattern(r[col], pattern));
      return chain;
    },
    like: (col: string, pattern: string) => {
      rows = rows.filter((r) => matchesPattern(r[col], pattern));
      return chain;
    },
    or: (expr: string) => {
      rows = rows.filter((r) => matchesOr(r, expr));
      return chain;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      const dir = opts?.ascending === false ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const x = a[col] as string | number, y = b[col] as string | number;
        if (x == null) return 1;
        if (y == null) return -1;
        return x < y ? -dir : x > y ? dir : 0;
      });
      return chain;
    },
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return chain;
    },
  };

  // Writes land on the in-memory rows so a preference chosen in the preview
  // survives the read that follows it.
  //
  // Applied on await, reading `rows` at that moment rather than when `update`
  // was called: supabase-js is written `.update(values).eq(...)`, so the
  // filters arrive AFTER the values. Capturing the rows up front wrote the
  // change to every row in the table.
  //
  // It is still only memory — a page reload rebuilds the fixture from the
  // literals above, so the preview cannot demonstrate persistence across
  // reloads the way the real database does.
  chain.update = (values: Row) => {
    chain.then = (resolve: (v: unknown) => unknown) => {
      for (const r of rows) Object.assign(r, values);
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
    };
    return chain;
  };

  for (const method of [
    "select", "insert", "upsert", "delete", "gt", "gte", "lt", "lte",
    "contains", "not", "filter", "range", "match", "overlaps", "abortSignal",
    "throwOnError",
  ]) {
    chain[method] = () => chain;
  }
  return chain;
}

const USER = { id: "u-1", email: PROFILES[0].email, user_metadata: {}, app_metadata: {} };

export const supabase = {
  from: (table: string) => builder(table),
  rpc: (name: string) =>
    Promise.resolve(
      name === "get_profile_display_names"
        ? { data: PROFILES.map(({ user_id, first_name, last_name }) => ({ user_id, first_name, last_name })), error: null }
        : { data: null, error: null },
    ),
  auth: {
    getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
    getSession: () => Promise.resolve({ data: { session: { user: USER } }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: { user: USER }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  },
  storage: {
    from: () => ({
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: "" }, error: null }),
      list: () => Promise.resolve({ data: [], error: null }),
      upload: () => Promise.resolve({ data: null, error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
    }),
  },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => undefined,
} as unknown as typeof import("@/integrations/supabase/client").supabase;
