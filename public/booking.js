// Online booking (Cal.com or Calendly). Only active when the admin has switched it on;
// the server then adds <meta name="gatherable-booking" content="<link>">.
(function () {
  var meta = document.querySelector('meta[name="gatherable-booking"]');
  var url = meta && meta.getAttribute("content");
  if (!url) return;
  var isCalendly = /calendly\.com/.test(url);

  document.querySelectorAll("[data-book-wrap]").forEach(function (el) { el.hidden = false; });

  var dlg = document.createElement("dialog");
  dlg.className = "book-dialog";
  dlg.innerHTML = '<div class="book-head"><b>Pick a time with George</b><a class="book-tab" target="_blank" rel="noopener">Open in a new tab ↗</a>' +
    '<button type="button" class="book-x" aria-label="Close">×</button></div><iframe title="Booking calendar" loading="lazy"></iframe>';
  document.body.appendChild(dlg);
  dlg.querySelector(".book-x").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });

  function link(embed) {
    var lead = window.__gatherableLead || {};
    var q = new URLSearchParams();
    if (embed && isCalendly) { q.set("embed_type", "Inline"); q.set("embed_domain", location.hostname); q.set("hide_gdpr_banner", "1"); }
    if (embed && !isCalendly) q.set("embed", "true");
    if (lead.name) q.set("name", lead.name);
    if (lead.email) q.set("email", lead.email);
    var s = q.toString();
    return url + (s ? "?" + s : "");
  }
  function open(e) {
    if (e) e.preventDefault();
    dlg.querySelector("iframe").src = link(true);
    dlg.querySelector(".book-tab").href = link(false);
    if (dlg.showModal) dlg.showModal(); else window.open(link(false), "_blank");
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-book]"); if (b) open(e); });
  window.gatherableOpenBooking = open;
})();
