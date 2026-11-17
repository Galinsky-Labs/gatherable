// Email via Resend (https://resend.com). The API key is pasted in the admin page and stored
// encrypted in the settings table; nothing is sent until the sending domain is verified.
const API = process.env.RESEND_API_URL || "https://api.resend.com";

export const EMAIL_DEFAULTS = {
  apiKey: "",
  from: "Gatherable <hello@gatherablehub.com>",
  replyTo: "galinsky.george@gmail.com",
  alertTo: "galinsky.george@gmail.com",
  domain: "gatherablehub.com",
  domainId: "",
  domainStatus: "",
  toggles: { leadAlerts: true, pitchReports: true, buyerEmails: true, dailyDigest: true, followUp: false },
  followUpDays: 4,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function createMailer({ pool, encrypt, decrypt, canEncrypt }) {
  let cache = null;

  async function getConfig() {
    if (cache) return cache;
    let cfg = { ...EMAIL_DEFAULTS, toggles: { ...EMAIL_DEFAULTS.toggles } };
    if (pool && canEncrypt) {
      try {
        const r = await pool.query("SELECT value FROM settings WHERE key='email'");
        if (r.rows[0]) {
          const saved = JSON.parse(decrypt(r.rows[0].value));
          cfg = { ...cfg, ...saved, toggles: { ...cfg.toggles, ...(saved.toggles || {}) } };
        }
      } catch (e) {
        console.error("email settings unreadable:", e.message);
      }
    }
    return (cache = cfg);
  }

  async function saveConfig(cfg) {
    await pool.query(
      "INSERT INTO settings (key,value,updated_at) VALUES ('email',$1,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()",
      [encrypt(JSON.stringify(cfg))]
    );
    cache = null;
  }

  async function api(path, { method = "GET", body, key } = {}) {
    const cfg = await getConfig();
    const r = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${key || cfg.apiKey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.message || data.error || `Resend error ${r.status}`), { status: r.status });
    return data;
  }

  const ready = (cfg) => !!(cfg.apiKey && cfg.domainStatus === "verified");

  // Sends one email and logs it. Never throws: a failed email must not break the site.
  async function send({ to, subject, html, text, kind, ref, replyTo, force }) {
    const cfg = await getConfig();
    if (!force && !ready(cfg)) return { skipped: "not configured" };
    let status = "sent", error = null, id = null;
    try {
      const d = await api("/emails", {
        method: "POST",
        body: { from: cfg.from, to: [to], subject, html, text, reply_to: replyTo || cfg.replyTo || undefined },
      });
      id = d.id;
    } catch (e) {
      status = "failed";
      error = e.message;
      console.error("email failed", kind, e.message);
    }
    if (pool)
      await pool
        .query("INSERT INTO email_log (kind, recipient, subject, status, error, ref, provider_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
          kind, to, subject, status, error, ref ? String(ref) : null, id,
        ])
        .catch(() => {});
    return { status, error };
  }

  return { getConfig, saveConfig, api, send, ready, invalidate: () => (cache = null) };
}

// ---------- templates ----------
function layout(title, bodyHtml, footer = "") {
  return `<!doctype html><html><body style="margin:0;background:#EEF5F5;font-family:Arial,Helvetica,sans-serif;color:#14294A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF5F5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#14294A;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.5px">gatherable<span style="color:#A8CDCE;font-weight:normal;font-size:12px;display:block;letter-spacing:1px">AUTHENTIC STRATEGIC CREATIVE COLLABORATIONS</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<h1 style="font-size:20px;margin:0 0 14px;color:#14294A">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#F6FAFA;color:#526276;font-size:12px;line-height:1.5">Gatherable, LLC · 26 Cove Side Lane A-1, Stonington, CT 06378 · <a href="https://gatherablehub.com" style="color:#2A919B">gatherablehub.com</a>${footer ? "<br>" + footer : ""}</td></tr>
</table></td></tr></table></body></html>`;
}
const p = (s) => `<p style="margin:0 0 12px">${s}</p>`;
const btn = (href, label) =>
  `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#2A919B;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px;display:inline-block">${esc(label)}</a></p>`;
const list = (items) => `<ul style="margin:0 0 12px;padding-left:20px">${items.map((i) => `<li style="margin-bottom:6px">${i}</li>`).join("")}</ul>`;
const strip = (html) => html.replace(/<li[^>]*>/g, "\n- ").replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();

export function leadAlertEmail({ lead, topicLabel, brief, review, adminUrl }) {
  const rows = [
    `<b>Email:</b> <a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>`,
    lead.phone && `<b>Phone:</b> ${esc(lead.phone)}`,
    lead.company && `<b>Company:</b> ${esc(lead.company)}`,
    `<b>Role:</b> ${esc(lead.role)}`,
    `<b>Looking for:</b> ${esc(topicLabel)}`,
    ...Object.entries(lead.answers || {}).filter(([, v]) => v).map(([k, v]) => `<b>${esc(k.replace(/_/g, " "))}:</b> ${esc(v)}`),
  ].filter(Boolean);
  let body = list(rows);
  if (lead.message) body += p(`<b>Message:</b><br>${esc(lead.message).replace(/\n/g, "<br>")}`);
  if (brief)
    body += `<div style="background:#F6FAFA;border-left:3px solid #2A919B;padding:12px 14px;margin:14px 0">
      <b>AI brief</b> · ${esc(brief.urgency)} urgency · suggests <i>${esc(brief.recommended_service)}</i>
      ${p(esc(brief.summary))}<b>Ask in the meeting:</b>${list((brief.questions_to_ask || []).map(esc))}</div>`;
  if (review)
    body += `<div style="background:#F6FAFA;border-left:3px solid #2A919B;padding:12px 14px;margin:14px 0">
      <b>Pitch Check score: ${esc(review.overall_score)}/100</b>${p(esc(review.headline))}<b>Top fixes:</b>${list((review.top_fixes || []).map((f) => esc(f.title)))}</div>`;
  body += btn(adminUrl, "Open in admin");
  const subject = `${review ? "Pitch Check" : "New lead"}: ${lead.name}${lead.company ? " (" + lead.company + ")" : ""}`;
  const html = layout(review ? "New Pitch Check" : "New inquiry", p(`<b>${esc(lead.name)}</b> just ${review ? "ran a Pitch Check" : "sent a request through the website"}.`) + body);
  return { subject, html, text: strip(html) };
}

export function pitchReportEmail({ name, docType, result, bookUrl }) {
  const r = result;
  let body = p(`Hi ${esc(name.split(" ")[0])}, here is the full Pitch Check for your ${esc(docType.toLowerCase())}.`);
  body += `<p style="font-size:28px;font-weight:bold;margin:8px 0 4px;color:#14294A">${esc(r.overall_score)}/100</p>${p(`<b>${esc(r.headline)}</b>`)}${p(esc(r.doc_summary))}`;
  body += `<h2 style="font-size:16px;margin:18px 0 8px">Scorecard</h2>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${(r.scores || [])
      .map((s) => `<tr><td style="padding:6px 0;border-top:1px solid #E4EAE9;vertical-align:top;width:42%"><b>${esc(s.criterion)}</b></td><td style="padding:6px 0;border-top:1px solid #E4EAE9;vertical-align:top;width:12%"><b>${esc(s.score)}/10</b></td><td style="padding:6px 0;border-top:1px solid #E4EAE9;color:#526276">${esc(s.rationale)}</td></tr>`)
      .join("")}</table>`;
  body += `<h2 style="font-size:16px;margin:18px 0 8px">Top 3 fixes</h2>` +
    (r.top_fixes || []).map((f, i) => p(`<b>${i + 1}. ${esc(f.title)}</b><br><span style="color:#526276">Why it matters: ${esc(f.why)}<br>How: ${esc(f.how)}</span>`)).join("");
  body += `<h2 style="font-size:16px;margin:18px 0 8px">What's working</h2>${list((r.strengths || []).map(esc))}`;
  body += `<h2 style="font-size:16px;margin:18px 0 8px">Questions the client will ask</h2>${list((r.client_questions || []).map(esc))}`;
  body += p("This is an AI first read using Gatherable's review criteria. George can go deeper: review the deck himself, pressure-test the strategy and coach your team through rehearsal.");
  body += btn(bookUrl, "Book a meeting with George");
  const html = layout("Your Pitch Check results", body, "You're receiving this because you ran a Pitch Check on gatherablehub.com.");
  return { subject: `Your Pitch Check: ${r.overall_score}/100`, html, text: strip(html) };
}

export function purchaseEmail({ name, title, downloadUrl, amount }) {
  const body =
    p(`Hi${name ? " " + esc(name.split(" ")[0]) : ""}, thank you for buying <b>${esc(title)}</b>${amount ? ` (${esc(amount)})` : ""}.`) +
    btn(downloadUrl, "Download your checklist") +
    p("Keep this email: the link works for up to 25 downloads. If anything goes wrong, just reply and we'll sort it out.") +
    p("Want help putting it to work? George can review your deck, coach your team or run your agency search: reply to this email or book a meeting at gatherablehub.com.");
  const html = layout("Your download is ready", body);
  return { subject: `Your download: ${title}`, html, text: strip(html) };
}

export function saleAlertEmail({ title, name, email, amount, adminUrl }) {
  const html = layout("New sale", p(`<b>${esc(name || email)}</b> bought <b>${esc(title)}</b> for ${esc(amount)}.`) + list([`<b>Email:</b> ${esc(email)}`]) + btn(adminUrl, "See sales in admin"));
  return { subject: `New sale: ${title} (${amount})`, html, text: strip(html) };
}

export function digestEmail({ due, fresh, adminUrl }) {
  let body = "";
  if (due.length)
    body += `<h2 style="font-size:16px;margin:0 0 8px">Follow-ups due (${due.length})</h2>` +
      list(due.map((l) => `<b>${esc(l.name)}</b>${l.company ? " · " + esc(l.company) : ""} · ${esc(l.status)} · due ${esc(l.follow_up_at)}${l.last_note ? `<br><span style="color:#526276">Last note: ${esc(l.last_note)}</span>` : ""}`));
  if (fresh.length)
    body += `<h2 style="font-size:16px;margin:16px 0 8px">New leads in the last day (${fresh.length})</h2>` +
      list(fresh.map((l) => `<b>${esc(l.name)}</b>${l.company ? " · " + esc(l.company) : ""} · ${esc(l.source === "pitch_check" ? "Pitch Check" : "Contact form")}`));
  body += btn(adminUrl, "Open leads in admin");
  const html = layout("Your Gatherable daily summary", body);
  return { subject: `Today: ${due.length} follow-up${due.length === 1 ? "" : "s"} due, ${fresh.length} new lead${fresh.length === 1 ? "" : "s"}`, html, text: strip(html) };
}

export function followUpEmail({ name, score, bookUrl }) {
  const body =
    p(`Hi ${esc(name.split(" ")[0])},`) +
    p(`A few days ago you ran a Pitch Check on gatherablehub.com${score != null ? ` and scored ${esc(score)}/100` : ""}. How is the deck coming along?`) +
    p("If you'd like a second set of eyes before it goes out, I'm happy to look at it with you: a deck review, rehearsal coaching, or just a quick conversation about the pitch.") +
    btn(bookUrl, "Book a time with me") +
    p("George G. Galinsky<br>Founder, Gatherable");
  const html = layout("How's the pitch going?", body, "A one-time follow-up because you used the Pitch Check. Reply if you'd rather not hear from us.");
  return { subject: "How's the pitch going?", html, text: strip(html) };
}

export function testEmail() {
  const html = layout("Email is working", p("This is a test from your Gatherable website. Lead alerts, Pitch Check reports and purchase emails will look like this."));
  return { subject: "Test email from gatherablehub.com", html, text: strip(html) };
}
