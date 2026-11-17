// Page rendering: applies the admin's text edits and SEO settings to the static HTML pages,
// and builds robots.txt, sitemap.xml and structured data.
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "node-html-parser";

const PARSE_OPTS = { comment: true, blockTextElements: { script: true, noscript: true, style: true, pre: true } };

// Public pages that can be edited and tuned for search. path -> file in public/
export const PAGES = {
  "/": { file: "index.html", label: "Home page", indexed: true },
  "/pitch-check": { file: "pitch-check.html", label: "Pitch Check page", indexed: true },
  "/thank-you": { file: "thank-you.html", label: "Thank-you page (after purchase)", indexed: false },
  "/privacy": { file: "privacy.html", label: "Privacy policy", indexed: true, legal: "privacy" },
  "/terms": { file: "terms.html", label: "Terms of use", indexed: true, legal: "terms" },
};

export function createSite({ pool, publicDir, canonicalHost }) {
  const baseUrl = () => (canonicalHost ? `https://${canonicalHost}` : "");
  let contentCache = null; // { "/": { k1: html } }
  let seoCache = null;
  const settingCache = new Map();

  async function getSetting(key, fallback) {
    if (settingCache.has(key)) return settingCache.get(key);
    let v = fallback;
    if (pool) {
      try {
        const r = await pool.query("SELECT value FROM settings WHERE key=$1", [key]);
        if (r.rows[0]) v = { ...fallback, ...JSON.parse(r.rows[0].value) };
      } catch {}
    }
    settingCache.set(key, v);
    return v;
  }
  async function setSetting(key, value) {
    await pool.query(
      "INSERT INTO settings (key,value,updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()",
      [key, JSON.stringify(value)]
    );
    settingCache.delete(key);
  }
  const getLegal = () => getSetting("legal", { privacy: false, terms: false });
  const getBooking = () => getSetting("booking", { url: "", provider: "", live: false });
  async function isPublished(pagePath) {
    const legal = PAGES[pagePath]?.legal;
    return !legal || !!(await getLegal())[legal];
  }

  async function getContent() {
    if (contentCache) return contentCache;
    const out = {};
    if (pool) {
      try {
        const r = await pool.query("SELECT page, key, html FROM content");
        for (const row of r.rows) (out[row.page] ||= {})[row.key] = row.html;
      } catch (e) {
        console.error("content load failed:", e.message);
      }
    }
    return (contentCache = out);
  }

  async function getSeo() {
    if (seoCache) return seoCache;
    let seo = { pages: {}, gsc: "", bing: "", ga4: "" };
    if (pool) {
      try {
        const r = await pool.query("SELECT value FROM settings WHERE key='seo'");
        if (r.rows[0]) seo = { ...seo, ...JSON.parse(r.rows[0].value) };
      } catch {}
    }
    return (seoCache = seo);
  }

  async function saveSeo(seo) {
    await pool.query(
      "INSERT INTO settings (key,value,updated_at) VALUES ('seo',$1,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()",
      [JSON.stringify(seo)]
    );
    seoCache = null;
  }

  async function loadTemplate(pagePath) {
    const page = PAGES[pagePath];
    if (!page) return null;
    return parse(await fs.readFile(path.join(publicDir, page.file), "utf8"), PARSE_OPTS);
  }

  // Original (unedited) text of every editable element on a page: { k1: "html" }
  async function originals(pagePath) {
    const root = await loadTemplate(pagePath);
    const out = {};
    if (!root) return out;
    for (const el of root.querySelectorAll("[data-edit]")) out[el.getAttribute("data-edit")] ??= el.innerHTML.trim();
    for (const img of root.querySelectorAll("img[data-edit-img]"))
      out["img:" + img.getAttribute("data-edit-img")] ??= JSON.stringify({ src: img.getAttribute("src"), alt: img.getAttribute("alt") || "" });
    return out;
  }

  function setMeta(head, attr, name, content) {
    let el = head.querySelector(`meta[${attr}="${name}"]`);
    if (!content) return;
    if (!el) {
      head.insertAdjacentHTML("beforeend", `<meta ${attr}="${name}" content="">`);
      el = head.querySelector(`meta[${attr}="${name}"]`);
    }
    el.setAttribute("content", content);
  }

  // Returns the final HTML for a page (edits + SEO applied); editMode adds the in-page editor.
  async function render(pagePath, { editorHtml } = {}) {
    if (!editorHtml && !(await isPublished(pagePath))) return null;
    const root = await loadTemplate(pagePath);
    if (!root) return null;
    const content = (await getContent())[pagePath] || {};
    for (const el of root.querySelectorAll("[data-edit]")) {
      const html = content[el.getAttribute("data-edit")];
      if (html != null) el.set_content(html);
    }
    // Replaced pictures
    for (const img of root.querySelectorAll("img[data-edit-img]")) {
      const k = "img:" + img.getAttribute("data-edit-img");
      const raw = content[k] ?? (await getContent())["*"]?.[k]; // "*" = shared across pages (the logo)
      if (!raw) continue;
      try {
        const v = JSON.parse(raw);
        const old = img.getAttribute("src");
        if (v.src) img.setAttribute("src", v.src);
        if (v.alt != null) img.setAttribute("alt", v.alt);
        if (v.w && v.h) { img.setAttribute("width", String(v.w)); img.setAttribute("height", String(v.h)); }
        for (const l of root.querySelectorAll('link[rel="preload"][as="image"]')) if (l.getAttribute("href") === old) l.setAttribute("href", v.src);
      } catch {}
    }
    // Footer links to published legal pages
    const legal = await getLegal();
    const links = [legal.privacy && '<a href="/privacy">Privacy</a>', legal.terms && '<a href="/terms">Terms</a>'].filter(Boolean);
    const foot = root.querySelector("footer .wrap");
    if (foot && links.length) foot.insertAdjacentHTML("beforeend", `<span class="legal-links">${links.join(" · ")}</span>`);

    const head = root.querySelector("head");
    const seo = await getSeo();
    const ps = seo.pages?.[pagePath] || {};
    const titleEl = head.querySelector("title");
    if (ps.title && titleEl) titleEl.set_content(escapeText(ps.title));
    const title = titleEl ? titleEl.textContent : "";
    const desc = ps.description || head.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const url = baseUrl() + (pagePath === "/" ? "/" : pagePath);
    const image = head.querySelector('meta[property="og:image"]')?.getAttribute("content") || `${baseUrl()}/img/hero.webp`;

    setMeta(head, "name", "description", desc);
    setMeta(head, "property", "og:site_name", "Gatherable");
    setMeta(head, "property", "og:type", "website");
    setMeta(head, "property", "og:title", title);
    setMeta(head, "property", "og:description", desc);
    if (baseUrl()) setMeta(head, "property", "og:url", url);
    setMeta(head, "property", "og:image", image.startsWith("http") ? image : baseUrl() + image);
    setMeta(head, "name", "twitter:card", "summary_large_image");
    setMeta(head, "name", "twitter:title", title);
    setMeta(head, "name", "twitter:description", desc);
    setMeta(head, "name", "twitter:image", image.startsWith("http") ? image : baseUrl() + image);
    if (!PAGES[pagePath].indexed) setMeta(head, "name", "robots", "noindex");
    if (seo.gsc) setMeta(head, "name", "google-site-verification", seo.gsc);
    if (seo.bing) setMeta(head, "name", "msvalidate.01", seo.bing);

    if (pagePath === "/") head.insertAdjacentHTML("beforeend", structuredData(root));
    const booking = await getBooking();
    if (booking.live && booking.url)
      setMeta(head, "name", "gatherable-booking", booking.url);
    if (seo.ga4 && !editorHtml)
      head.insertAdjacentHTML(
        "beforeend",
        `<script async src="https://www.googletagmanager.com/gtag/js?id=${seo.ga4}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${seo.ga4}');</script>`
      );
    if (editorHtml) root.querySelector("body").insertAdjacentHTML("beforeend", editorHtml);
    return "<!doctype html>\n" + root.toString().replace(/^<!doctype html>\s*/i, "");
  }

  // FAQ, founder and website schema, built from the page as currently edited.
  function structuredData(root) {
    const faqs = root.querySelectorAll("#faq details").map((d) => ({
      "@type": "Question",
      name: d.querySelector("summary")?.textContent.trim(),
      acceptedAnswer: { "@type": "Answer", text: d.querySelector("p")?.textContent.trim() },
    })).filter((q) => q.name && q.acceptedAnswer.text);
    const graph = [
      { "@type": "WebSite", "@id": `${baseUrl()}/#website`, url: `${baseUrl()}/`, name: "Gatherable", publisher: { "@id": `${baseUrl()}/#org` } },
      {
        "@type": "Person",
        "@id": `${baseUrl()}/#george`,
        name: "George G. Galinsky",
        jobTitle: "Founder",
        image: `${baseUrl()}/img/founder.webp`,
        url: `${baseUrl()}/#about`,
        worksFor: { "@type": "Organization", "@id": `${baseUrl()}/#org`, name: "Gatherable, LLC", url: `${baseUrl()}/`, logo: `${baseUrl()}/img/logo.png` },
      },
    ];
    if (faqs.length) graph.push({ "@type": "FAQPage", mainEntity: faqs });
    const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
    return `<script type="application/ld+json">${json}</script>`;
  }

  async function robots() {
    return [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /api/",
      "Disallow: /download/",
      "Disallow: /thank-you",
      "",
      `Sitemap: ${baseUrl()}/sitemap.xml`,
      "",
    ].join("\n");
  }

  async function sitemap() {
    let last = new Date().toISOString().slice(0, 10);
    if (pool) {
      try {
        const r = await pool.query("SELECT max(updated_at) AS t FROM content");
        if (r.rows[0]?.t) last = new Date(r.rows[0].t).toISOString().slice(0, 10);
      } catch {}
    }
    const pub = [];
    for (const [p, info] of Object.entries(PAGES)) if (info.indexed && (await isPublished(p))) pub.push([p, info]);
    const urls = pub
      .map(([p]) => `  <url><loc>${baseUrl()}${p}</loc><lastmod>${last}</lastmod><priority>${p === "/" ? "1.0" : "0.8"}</priority></url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }

  // Quick SEO health check of each indexed page, as currently rendered.
  async function audit() {
    const seo = await getSeo();
    const out = [];
    for (const [p, info] of Object.entries(PAGES)) {
      if (!info.indexed || !(await isPublished(p))) continue;
      const root = parse(await render(p), PARSE_OPTS);
      const title = root.querySelector("title")?.textContent.trim() || "";
      const desc = root.querySelector('meta[name="description"]')?.getAttribute("content") || "";
      const h1s = root.querySelectorAll("h1").length;
      const noAlt = root.querySelectorAll("img").filter((i) => !i.getAttribute("alt")).length;
      out.push({
        path: p,
        label: info.label,
        title,
        desc,
        checks: [
          [title.length >= 30 && title.length <= 60, `Title length ${title.length} (aim for 30–60 characters)`],
          [desc.length >= 70 && desc.length <= 160, `Description length ${desc.length} (aim for 70–160 characters)`],
          [h1s === 1, `${h1s} main heading${h1s === 1 ? "" : "s"} (should be exactly 1)`],
          [noAlt === 0, noAlt ? `${noAlt} image(s) missing alt text` : "All images have alt text"],
          [!!root.querySelector('link[rel="canonical"]'), "Canonical link"],
        ],
      });
    }
    return {
      pages: out,
      site: [
        [true, "HTTPS, sitemap.xml and robots.txt are served"],
        [true, "Structured data: business, founder and FAQ"],
        [!!seo.gsc, seo.gsc ? "Google Search Console verification tag added" : "Google Search Console not verified yet"],
        [seo.ga4 ? true : null, seo.ga4 ? "Google Analytics connected" : "Google Analytics not connected (optional)"],
      ],
    };
  }

  return {
    render,
    originals,
    getSetting,
    setSetting,
    getLegal,
    getBooking,
    isPublished,
    getSeo,
    saveSeo,
    robots,
    sitemap,
    audit,
    invalidateContent: () => (contentCache = null),
  };
}

function escapeText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

// Keeps only simple inline formatting from the editor: bold, italic, line breaks and links.
export function sanitizeInline(html) {
  const root = parse(`<div>${String(html).slice(0, 8000)}</div>`, { comment: false });
  const ALLOWED = new Set(["b", "strong", "i", "em", "br", "a"]);
  const walk = (node) => {
    let out = "";
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += escapeText(n.text.replace(/ /g, " "));
      else if (n.nodeType === 1) {
        const tag = n.rawTagName?.toLowerCase();
        const inner = walk(n);
        if (!ALLOWED.has(tag)) out += inner;
        else if (tag === "br") out += "<br>";
        else if (tag === "a") {
          const href = n.getAttribute("href") || "";
          out += /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href) ? `<a href="${escapeText(href).replace(/"/g, "&quot;")}">${inner}</a>` : inner;
        } else out += `<${tag}>${inner}</${tag}>`;
      }
    }
    return out;
  };
  return walk(root.firstChild).replace(/\s+/g, " ").trim();
}
