// Tags every editable piece of text in the public pages with a stable data-edit="kN" key,
// so the admin's in-page editor can save changes against it. Safe to re-run: existing keys
// are kept and only new elements get new numbers.
//   node tools/assign-edit-keys.mjs
import fs from "node:fs";
import { parse } from "node-html-parser";

const PAGES = ["public/index.html", "public/pitch-check.html", "public/thank-you.html"];
const CANDIDATES =
  "h1,h2,h3,h4,p,li,summary,legend,td,th,blockquote,.eyebrow,a.btn,.stat b,.stat span,.contact-info strong";
const SKIP_INSIDE = "script,style,noscript,form,select,.progress,.hp,a.logo,.side,#pc-result,#buy-cards";

for (const file of PAGES) {
  const raw = fs.readFileSync(file, "utf8");
  const root = parse(raw, { comment: true, blockTextElements: { script: true, noscript: true, style: true, pre: true } });
  let max = 0;
  for (const el of root.querySelectorAll("[data-edit]")) max = Math.max(max, Number(el.getAttribute("data-edit").slice(1)) || 0);

  const awardKeys = new Map(); // duplicated marquee items share one key
  let added = 0;
  for (const el of root.querySelectorAll(CANDIDATES)) {
    if (el.getAttribute("data-edit")) continue;
    if (el.closest(SKIP_INSIDE)) continue;
    if (el.getAttribute("id")) continue; // filled in by scripts
    if (el.querySelector("input,select,textarea,button,img,svg,[data-edit]")) continue;
    let anc = el.parentNode, nested = false;
    while (anc && anc.getAttribute) { if (anc.getAttribute("data-edit")) { nested = true; break; } anc = anc.parentNode; }
    if (nested) continue;
    if (!el.textContent.trim()) continue;
    if (el.closest(".awards")) {
      const t = el.textContent.trim();
      if (!awardKeys.has(t)) awardKeys.set(t, "k" + ++max);
      el.setAttribute("data-edit", awardKeys.get(t));
    } else el.setAttribute("data-edit", "k" + ++max);
    added++;
  }
  fs.writeFileSync(file, root.toString());
  console.log(file, "added", added, "max key", max);
}
