import { query } from "../db/pool.js";

/**
 * Notification text, in all three languages.
 *
 * These were being sent to a language model on every notification — eleven
 * fixed sentences, translated afresh each time, at the cost of an API call per
 * message. Written once by hand they are better in every way: correct, instant,
 * free, identical every time, and they work when nothing else does.
 *
 * A model is for text that could not have been written in advance. This is not
 * that.
 */
const TEMPLATES = {
  received: {
    en: { title: "Report received", body: (c) => `${c.category} at ${c.ward} has been filed as ${c.ref}.` },
    hi: { title: "शिकायत मिल गई", body: (c) => `${c.ward} में ${c.category} की शिकायत ${c.ref} के रूप में दर्ज हो गई है।` },
    mr: { title: "तक्रार मिळाली", body: (c) => `${c.ward} मधील ${c.category} ची तक्रार ${c.ref} म्हणून नोंदवली आहे.` },
  },
  analysed: {
    en: { title: "Analysis complete", body: (c) => `${c.ref} was classified as ${c.category}, ${c.severity} priority.` },
    hi: { title: "जाँच पूरी हुई", body: (c) => `${c.ref} को ${c.category} में रखा गया है, प्राथमिकता ${c.severity}।` },
    mr: { title: "तपासणी पूर्ण", body: (c) => `${c.ref} ${c.category} म्हणून वर्गीकृत, प्राधान्य ${c.severity}.` },
  },
  routed: {
    en: { title: "Department assigned", body: (c) => `${c.ref} was routed to ${c.department}.` },
    hi: { title: "विभाग तय हुआ", body: (c) => `${c.ref} को ${c.department} के पास भेजा गया है।` },
    mr: { title: "विभाग निश्चित", body: (c) => `${c.ref} ${c.department} कडे पाठवले आहे.` },
  },
  assigned: {
    en: { title: "Officer assigned", body: (c) => `${c.officer} is handling ${c.ref}.` },
    hi: { title: "अधिकारी नियुक्त", body: (c) => `${c.ref} की ज़िम्मेदारी ${c.officer} के पास है।` },
    mr: { title: "अधिकारी नेमला", body: (c) => `${c.ref} ची जबाबदारी ${c.officer} यांच्याकडे आहे.` },
  },
  work_started: {
    en: { title: "Work started", body: (c) => `Work has begun on ${c.ref}.` },
    hi: { title: "काम शुरू हुआ", body: (c) => `${c.ref} पर काम शुरू हो गया है।` },
    mr: { title: "काम सुरू झाले", body: (c) => `${c.ref} वर काम सुरू झाले आहे.` },
  },
  verify: {
    en: { title: "Confirm the fix", body: (c) => `The officer has marked ${c.ref} complete. Tell us whether it is actually fixed.` },
    hi: { title: "पुष्टि करें", body: (c) => `अधिकारी ने ${c.ref} पूरा बताया है। बताइए कि वाकई ठीक हुआ या नहीं।` },
    mr: { title: "खात्री करा", body: (c) => `अधिकाऱ्याने ${c.ref} पूर्ण म्हटले आहे. खरेच झाले का ते सांगा.` },
  },
  resolved: {
    en: { title: "Report closed", body: (c) => `${c.ref} is resolved. Thank you.` },
    hi: { title: "शिकायत बंद", body: (c) => `${c.ref} हल हो गई। धन्यवाद।` },
    mr: { title: "तक्रार बंद", body: (c) => `${c.ref} सुटली आहे. धन्यवाद.` },
  },
  reopened: {
    en: { title: "Report reopened", body: (c) => `${c.ref} was reopened and escalated.` },
    hi: { title: "शिकायत फिर खुली", body: (c) => `${c.ref} दोबारा खोली गई और आगे बढ़ाई गई।` },
    mr: { title: "तक्रार पुन्हा उघडली", body: (c) => `${c.ref} पुन्हा उघडली आणि वर पाठवली.` },
  },
  sla_breach: {
    en: { title: "SLA breached", body: (c) => `${c.ref} passed its ${c.sla_label} deadline.` },
    hi: { title: "समयसीमा पार", body: (c) => `${c.ref} की ${c.sla_label} समयसीमा निकल गई।` },
    mr: { title: "मुदत संपली", body: (c) => `${c.ref} ची ${c.sla_label} मुदत संपली.` },
  },
  escalated: {
    en: { title: "Escalated to you", body: (c) => `${c.ref} was escalated after no progress.` },
    hi: { title: "आप तक बढ़ाया गया", body: (c) => `${c.ref} पर प्रगति न होने पर आगे बढ़ाया गया।` },
    mr: { title: "तुमच्याकडे पाठवले", body: (c) => `${c.ref} वर प्रगती नसल्याने वर पाठवले.` },
  },
  badge_earned: {
    en: { title: "Badge earned", body: (c) => `You earned "${c.badge}" for ${c.why}.` },
    hi: { title: "बैज मिला", body: (c) => `${c.why} के लिए आपको "${c.badge}" बैज मिला।` },
    mr: { title: "बॅज मिळाला", body: (c) => `${c.why} साठी तुम्हाला "${c.badge}" बॅज मिळाला.` },
  },
  rejected: {
    en: { title: "Report not accepted", body: (c) => `${c.ref} was not accepted: ${c.reason}` },
    hi: { title: "शिकायत स्वीकार नहीं हुई", body: (c) => `${c.ref} स्वीकार नहीं की गई: ${c.reason}` },
    mr: { title: "तक्रार स्वीकारली नाही", body: (c) => `${c.ref} स्वीकारली नाही: ${c.reason}` },
  },
  cluster_grown: {
    en: { title: "Group growing", body: (c) => `${c.ref} has reached ${c.report_count} reports.` },
    hi: { title: "समूह बढ़ रहा है", body: (c) => `${c.ref} में अब ${c.report_count} शिकायतें हैं।` },
    mr: { title: "गट वाढतो आहे", body: (c) => `${c.ref} मध्ये आता ${c.report_count} तक्रारी आहेत.` },
  },
};

/** Writes a notification in the recipient's own language. */
export async function notify({ userId, kind, complaintId, context = {} }) {
  const set = TEMPLATES[kind];
  if (!set) return;

  const { rows } = await query(`select language from profiles where id = $1`, [userId]);
  // Falls back to English rather than failing — an untranslated notification
  // still tells somebody what happened.
  const template = set[rows[0]?.language] || set.en;

  await query(
    `insert into notifications (user_id, kind, title, body, complaint_id) values ($1,$2,$3,$4,$5)`,
    [userId, kind, template.title, template.body(context), complaintId || null]
  );
}

/** Fan-out to every administrator of a department. */
export async function notifyDepartment(departmentId, payload) {
  const { rows } = await query(
    `select p.id from profiles p
     join officers o on o.id = p.id
     where p.role in ('super_admin','global_admin') and o.department_id = $1`,
    [departmentId]
  );
  await Promise.all(rows.map((r) => notify({ ...payload, userId: r.id })));
}
