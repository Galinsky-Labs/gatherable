// In-page text editor, injected only into /admin/edit pages (behind the admin password).
(function () {
  var PAGE = window.__EDIT_PAGE__, PAGES = window.__EDIT_PAGES__;
  var dirty = {}, count = 0;
  var bar = document.getElementById("ge-bar"), countEl = document.getElementById("ge-count"),
      saveBtn = document.getElementById("ge-save"), undoBtn = document.getElementById("ge-undo"), msg = document.getElementById("ge-msg");

  // Push the page down by the toolbar's real height (it can wrap on small screens).
  function pad() {
    var h = bar.offsetHeight;
    document.body.style.setProperty("padding-top", h + "px", "important");
    var hd = document.querySelector("header");
    if (hd) hd.style.setProperty("top", h + "px", "important");
  }
  window.addEventListener("resize", pad);
  if (window.ResizeObserver) new ResizeObserver(pad).observe(bar);
  pad();

  var sel = document.getElementById("ge-page");
  Object.keys(PAGES).forEach(function (p) {
    var o = document.createElement("option"); o.value = p; o.textContent = PAGES[p]; if (p === PAGE) o.selected = true; sel.appendChild(o);
  });
  sel.addEventListener("change", function () {
    if (count && !confirm("You have unsaved changes on this page. Leave without saving?")) { sel.value = PAGE; return; }
    count = 0; location.href = "/admin/edit?page=" + encodeURIComponent(sel.value);
  });

  // Show everything that is normally hidden or collapsed, so all text can be reached.
  document.querySelectorAll("details").forEach(function (d) { d.open = true; });
  document.querySelectorAll("#checklist[hidden]").forEach(function (s) { s.hidden = false; });

  var els = document.querySelectorAll("[data-edit]");
  els.forEach(function (el) {
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "true");
    el.dataset.orig = el.innerHTML;
    el.classList.add("ge-editable");
    el.addEventListener("input", function () {
      var k = el.dataset.edit;
      // keep repeated copies (e.g. the scrolling awards bar) in sync
      document.querySelectorAll('[data-edit="' + k + '"]').forEach(function (o) { if (o !== el) o.innerHTML = el.innerHTML; });
      dirty[k] = el.innerHTML;
      el.classList.add("ge-changed");
      update();
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey && /^(P|BLOCKQUOTE|LI|TD)$/.test(el.tagName)) document.execCommand("insertLineBreak");
        else el.blur();
      }
    });
    el.addEventListener("paste", function (e) {
      e.preventDefault();
      document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
    });
  });

  // While editing, links and buttons don't navigate or submit.
  document.addEventListener("click", function (e) {
    if (e.target.closest("#ge-bar")) return;
    var a = e.target.closest("a,button,summary,label");
    if (a) e.preventDefault();
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  function update() {
    count = Object.keys(dirty).length;
    countEl.textContent = count ? count + " unsaved change" + (count > 1 ? "s" : "") : "No unsaved changes";
    saveBtn.disabled = undoBtn.disabled = !count;
    msg.textContent = "";
  }

  undoBtn.addEventListener("click", function () {
    els.forEach(function (el) { if (dirty[el.dataset.edit] != null) { el.innerHTML = el.dataset.orig; el.classList.remove("ge-changed"); } });
    dirty = {}; update();
  });

  saveBtn.addEventListener("click", function () {
    saveBtn.disabled = true; msg.textContent = "Saving…";
    fetch("/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: PAGE, changes: dirty }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Could not save"); return d; }); })
      .then(function () {
        els.forEach(function (el) { el.dataset.orig = el.innerHTML; el.classList.remove("ge-changed"); });
        dirty = {}; update(); msg.textContent = "Saved. The live site is updated.";
      })
      .catch(function (x) { msg.textContent = x.message; saveBtn.disabled = false; });
  });

  window.addEventListener("beforeunload", function (e) { if (count) { e.preventDefault(); e.returnValue = ""; } });
  update();
})();
