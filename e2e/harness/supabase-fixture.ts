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
  { id: "r-3", title: "Section 1 question bank", resource_type: "link", subsection_id: "sub-3", created_at: "2026-08-21T09:00:00Z", description: null, url: "https://example.invalid/bank", file_path: null, folder_id: "fd-6", file_size: null, updated_at: "2026-09-16T09:00:00Z" },
  { id: "r-4", title: "ENT UK tonsillectomy guideline", resource_type: "document", subsection_id: "sub-4", created_at: "2026-08-14T09:00:00Z", description: null, url: null, file_path: null, folder_id: null, file_size: 317000, updated_at: "2026-09-05T09:00:00Z" },
  { id: "r-5", title: "Regional audit template", resource_type: "checklist", subsection_id: "sub-5", created_at: "2026-08-06T09:00:00Z", description: null, url: null, file_path: null, folder_id: "fd-1", file_size: 47000, updated_at: "2026-08-20T09:00:00Z" },
  // In the withdrawn specialty, and so unfindable. Its title shares the word
  // "audit" with r-5 above, which is the point: searching "audit" must return
  // the one and not the other.
  // A section with enough in it to show ordering, sizes and dates doing
  // something — one file per section demonstrated neither.
  { id: "r-7", title: "Week 10 — Airway workshop", resource_type: "video", subsection_id: "sub-1", created_at: "2026-09-01T09:00:00Z", description: null, url: null, file_path: null, folder_id: null, file_size: 412000000, updated_at: "2026-09-19T09:00:00Z" },
  { id: "r-8", title: "Week 2 — Head and neck anatomy", resource_type: "pdf", subsection_id: "sub-1", created_at: "2026-08-02T09:00:00Z", description: null, url: null, file_path: null, folder_id: null, file_size: 1800000, updated_at: "2026-06-04T09:00:00Z" },
  { id: "r-9", title: "ENT emergencies — quick reference", resource_type: "link", subsection_id: "sub-1", created_at: "2026-07-11T09:00:00Z", description: null, url: "https://example.invalid/ent", file_path: null, folder_id: null, file_size: null, updated_at: "2026-09-20T09:00:00Z" },
  { id: "r-6", title: "Cataract audit template", resource_type: "checklist", subsection_id: "sub-6", created_at: "2026-08-06T09:00:00Z", description: null, url: null, file_path: null, folder_id: null, file_size: 51000, updated_at: "2026-08-20T09:00:00Z" },
];

/**
 * Hangs the `subsections!inner(specialty_id, specialties!inner(short_name))`
 * embed off a row, the way PostgREST returns it.
 *
 * Both files and folders are selected with that embed and filtered through it
 * on `subsections.specialty_id`, so both need it here or the filter matches
 * nothing and the preview shows an empty drive.
 */
const withSub = <T extends { subsection_id: string }>(r: T) => {
  const sub = SUBSECTIONS.find((s) => s.id === r.subsection_id);
  const spec = sub ? specOf(sub.specialty_id) : undefined;
  return { ...r, subsections: sub ? { specialty_id: sub.specialty_id, specialties: { short_name: spec?.short_name ?? "" } } : null };
};

// Folders nest now, so the fixture has a branch two deep: Past papers holds
// two sittings, and one of those holds a file. A single flat level would
// demonstrate none of the behaviour that matters.
const FOLDERS = [
  { id: "fd-1", name: "Audit templates", subsection_id: "sub-5", parent_folder_id: null, subheading: null, sort_order: 1, created_at: "2026-08-01T09:00:00Z", updated_at: "2026-08-01T09:00:00Z" },
  { id: "fd-2", name: "Past papers", subsection_id: "sub-3", parent_folder_id: null, subheading: null, sort_order: 1, created_at: "2026-08-01T09:00:00Z", updated_at: "2026-08-01T09:00:00Z" },
  { id: "fd-4", name: "2026 sitting", subsection_id: "sub-3", parent_folder_id: "fd-2", subheading: null, sort_order: 1, created_at: "2026-08-02T09:00:00Z", updated_at: "2026-09-01T09:00:00Z" },
  { id: "fd-5", name: "2025 sitting", subsection_id: "sub-3", parent_folder_id: "fd-2", subheading: null, sort_order: 2, created_at: "2026-08-02T09:00:00Z", updated_at: "2026-08-02T09:00:00Z" },
  { id: "fd-6", name: "Section 1", subsection_id: "sub-3", parent_folder_id: "fd-4", subheading: null, sort_order: 1, created_at: "2026-08-03T09:00:00Z", updated_at: "2026-08-03T09:00:00Z" },
  // In the withdrawn specialty, so it must stay unfindable.
  { id: "fd-3", name: "Cataract audit archive", subsection_id: "sub-6", parent_folder_id: null, subheading: null, sort_order: 1, created_at: "2026-08-01T09:00:00Z", updated_at: "2026-08-01T09:00:00Z" },
];

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

// ---------------------------------------------------------------- register --
// One teaching register with two academic years of teaching days, so the
// attendance tab has figures, "All years" has more than one table, and the
// teaching day tab has a published day with sign-ins and feedback.
const REGISTER = {
  id: "reg-1", name: "NW · Otolaryngology", slug: "north-west-ent",
  deanery_name: DEANERY.name, specialty_name: "Otolaryngology", member_count: 3,
  i_am_member: true, i_am_owner: true, certificate_logo_path: null, my_request: null,
};

const REGISTER_DIRECTORY = [
  REGISTER,
  { ...REGISTER, id: "reg-2", name: "NW · Urology", slug: "north-west-urology",
    specialty_name: "Urology", member_count: 2 },
  { ...REGISTER, id: "reg-3", name: "NW · General Surgery", slug: "north-west-gen-surg",
    specialty_name: "General Surgery", member_count: 4, i_am_member: false, i_am_owner: false },
];

const REG_TRAINEES = [
  ["t-1", "Aisha Karim", "ST5"], ["t-2", "Ben Lowther", "ST4"], ["t-3", "Chloe Mensah", "ST6"],
  ["t-4", "Dev Patel", "ST3"], ["t-5", "Ellie Norris", "ST7"], ["t-6", "Farid Qureshi", "ST5"],
  ["t-7", "Grace O'Neill", "ST4"], ["t-8", "Harry Ibe", "ST8"],
].map(([id, name, grade]) => ({ id, name, grade, email: `${id}@example.invalid` }));

// Two teaching days share March 2026, and the oldest one was recorded before
// exact dates were kept, so it has only its month.
const REG_SESSIONS = [
  ["s-1", "2024-10", "Otology", ""], ["s-2", "2024-12-04", "Rhinology"], ["s-3", "2025-03-12", "Head & neck"],
  ["s-4", "2025-06-18", "Paediatric ENT"], ["s-5", "2025-09-10", "Airway"], ["s-6", "2025-11-05", "Facial plastics"],
  ["s-7", "2026-01-14", "Skull base"], ["s-8", "2026-03-04", "Laryngology"], ["s-10", "2026-03-25", "Voice clinic"],
  ["s-9", "2026-05-14", "Emergency ENT"], ["s-11", "2026-11-18", "Tracheostomy care"],
].map(([id, when, title]) => (when.length === 10
  ? { id, month: when.slice(0, 7), date: when, title }
  : { id, month: when, title }));

// A deterministic spread of attendance: most people at most days.
const REG_ATTENDANCE: Record<string, { grade: string }> = {};
REG_TRAINEES.forEach((t, ti) => REG_SESSIONS.forEach((s, si) => {
  if ((ti * 3 + si * 5) % 7 !== 0) REG_ATTENDANCE[`${t.id}|${s.id}`] = { grade: t.grade };
}));

const REGISTER_STORE = {
  register_id: REGISTER.id, version: 12, updated_at: "2026-05-20T09:00:00Z", updated_by: "u-1",
  data: {
    trainees: REG_TRAINEES,
    sessions: REG_SESSIONS,
    attendance: REG_ATTENDANCE,
    excused: [{ id: "x-1", trainee: "t-2", session: "s-8", reason: "Annual leave", ts: "1767225600000" }],
    status: [
      { id: "st-1", trainee: "t-8", type: "cct", start: null, end: "2025-08" },
      { id: "st-2", trainee: "t-4", type: "mat", start: "2026-01", end: "2026-06" },
    ],
  },
};

const LIVE_SESSION = {
  id: "live-9", register_id: REGISTER.id, title: "Emergency ENT", session_date: "2026-05-14",
  location: "Manchester Royal Infirmary", local_id: "s-9",
  form: { questions: [
    { id: "overall", type: "scale", text: "Overall, how useful was the day?" },
    { id: "q-1", type: "scale", text: "Relevance to your curriculum" },
  ] },
};

const REG_ATTENDEES = REG_TRAINEES.filter((t) => REG_ATTENDANCE[`${t.id}|s-9`]).map((t, i) => ({
  id: `a-${t.id}`, name: t.name, email: t.email, grade: t.grade,
  checked_in_at: "2026-05-14T09:05:00Z",
  feedback_completed: i % 3 !== 2,
  certificate_sent_at: i % 3 === 0 ? "2026-05-15T10:00:00Z" : null,
}));

const REG_FEEDBACK = REG_ATTENDEES.filter((a) => a.feedback_completed).map((a, i) => ({
  id: `f-${i}`, session_id: LIVE_SESSION.id, overall_rating: 5 - (i % 3),
  answers: { "q-1": 4 + (i % 2) }, comments: i === 0 ? "Great hands-on airway stations." : "",
  submitted_at: "2026-05-14T17:00:00Z",
}));

const REGISTER_MEMBERS = [
  { register_id: REGISTER.id, user_id: "u-1", role: "owner", granted_by: null, granted_at: "2025-08-01T09:00:00Z" },
  { register_id: REGISTER.id, user_id: "u-2", role: "editor", granted_by: "u-1", granted_at: "2025-09-01T09:00:00Z" },
  { register_id: REGISTER.id, user_id: "u-3", role: "editor", granted_by: "u-1", granted_at: "2025-10-01T09:00:00Z" },
  { register_id: "reg-2", user_id: "u-1", role: "owner", granted_by: null, granted_at: "2025-08-01T09:00:00Z" },
];

const REGISTER_REQUESTS = [
  { id: "rq-1", register_id: REGISTER.id, user_id: "u-4", status: "pending",
    reason: "I run the Liverpool teaching days.", created_at: "2026-09-20T09:00:00Z",
    decided_by: null, decided_at: null, decision_note: null },
];

const REGISTER_ARCHIVE = [
  { id: "reg-9", name: "NW · Plastic Surgery", slug: "north-west-plastics", deanery_name: DEANERY.name,
    specialty_name: "Plastic Surgery", archived_at: "2026-09-21T09:00:00Z",
    purge_at: "2026-10-06T09:00:00Z", trainee_count: 11, session_count: 6 },
];

const REGISTER_RPC: Record<string, unknown> = {
  register_directory: REGISTER_DIRECTORY,
  register_archive: REGISTER_ARCHIVE,
  register_people: PROFILES.map(({ user_id, first_name, last_name, email }) => ({ user_id, first_name, last_name, email })),
};

// The classic register: the same cohort, seen as an editor (not an owner) so
// the preview shows what an editor gets on Users & access. Its teaching days
// carry their live id on the blob, as classic sessions do, and one person
// ticked in the register is missing from the live list, so the "not on the
// live list yet" warning has something to say.
const CLASSIC_DIRECTORY = REGISTER_DIRECTORY.map((r) => ({ ...r, i_am_owner: false }));
const CLASSIC_STORE = {
  ...REGISTER_STORE,
  data: {
    ...REGISTER_STORE.data,
    sessions: REG_SESSIONS.map((s) => (s.id === "s-9" ? { ...s, cloudId: LIVE_SESSION.id } : s)),
  },
};
const CLASSIC_ATTENDEES = REG_ATTENDEES.slice(0, -1);

Object.assign(REGISTER_RPC, {
  classic_register_directory: CLASSIC_DIRECTORY,
  classic_register_archive: [],
  classic_register_people: REGISTER_RPC.register_people,
});

/** What the register-api edge function answers, by action. */
// Days are set up for check-in as the register opens; this is where they land.
const LIVE_SESSIONS: typeof LIVE_SESSION[] = [LIVE_SESSION];

function registerApi(body: { action?: string }, classic = false) {
  if (body.action === "create-session") {
    const b = body as Record<string, string>;
    const existing = LIVE_SESSIONS.find((l) => l.local_id === b.local_id);
    if (existing) {
      Object.assign(existing, { title: b.title, session_date: b.session_date, location: b.location });
      return { session: existing, created: false };
    }
    const created = {
      ...LIVE_SESSION, id: `live-${b.local_id}`, title: b.title, session_date: b.session_date,
      location: b.location ?? "", local_id: b.local_id,
    };
    LIVE_SESSIONS.push(created);
    return { session: created, created: true };
  }
  if (body.action === "session-status") {
    return {
      session: LIVE_SESSION, attendees: classic ? CLASSIC_ATTENDEES : REG_ATTENDEES,
      feedback_count: REG_FEEDBACK.length,
      email_configured: true, email_sandbox: false, email_from: "register@example.invalid",
    };
  }
  return {};
}

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
  register_stores: [REGISTER_STORE],
  register_members: REGISTER_MEMBERS,
  register_access_requests: REGISTER_REQUESTS,
  register_sessions: LIVE_SESSIONS,
  register_feedback: REG_FEEDBACK,
  classic_register_stores: [CLASSIC_STORE],
  classic_register_members: REGISTER_MEMBERS,
  classic_register_access_requests: REGISTER_REQUESTS,
  classic_register_sessions: LIVE_SESSIONS,
  classic_register_feedback: REG_FEEDBACK,
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
  // The app reads `resource_folders`; this key used to be `folders`, which no
  // query has ever asked for, so the drive rendered without any and the search
  // had nothing to find.
  resource_folders: FOLDERS.map(withSub),
  // `is_active` matters now that the fixture's `eq` filters for real: the
  // board asks for active notices, so a row without the column is dropped and
  // the banner renders empty.
  specialty_notices: [
    { id: "n-1", specialty_id: "sp-1", content: "The October teaching day has moved to Lecture Theatre B.", created_at: "2026-09-13T09:00:00Z", author_id: "u-3", is_active: true },
    { id: "n-2", specialty_id: "sp-1", content: "ARCP evidence for this rotation closes on 30 September.", created_at: "2026-09-10T09:00:00Z", author_id: "u-2", is_active: true },
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
        : { data: REGISTER_RPC[name] ?? null, error: null },
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
  functions: {
    invoke: (name: string, { body }: { body?: { action?: string } } = {}) =>
      Promise.resolve({ data: name === "register-api" ? registerApi(body ?? {})
        : name === "classic-register-api" ? registerApi(body ?? {}, true) : {}, error: null }),
  },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => undefined,
} as unknown as typeof import("@/integrations/supabase/client").supabase;
