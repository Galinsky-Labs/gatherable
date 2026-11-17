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
  document.querySelectorAll("#checklist[hidden],[data-book-wrap][hidden]").forEach(function (s) { s.hidden = false; });

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

  // ---- pictures: click to replace ----
  var picker = document.createElement("input");
  picker.type = "file"; picker.accept = "image/jpeg,image/png,image/webp"; picker.style.display = "none";
  document.body.appendChild(picker);
  var currentImg = null;
  var imgs = document.querySelectorAll("img[data-edit-img]");
  imgs.forEach(function (img) {
    img.classList.add("ge-img");
    img.title = "Click to change this picture";
    img.dataset.origSrc = img.getAttribute("src");
    img.dataset.origAlt = img.getAttribute("alt") || "";
    img.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      currentImg = img; picker.value = ""; picker.click();
    });
  });
  picker.addEventListener("change", function () {
    var file = picker.files[0], img = currentImg;
    if (!file || !img) return;
    if (file.size > 25 * 1024 * 1024) { alert("That file is very large. Please choose a picture under 25 MB."); return; }
    msg.textContent = "Preparing picture…";
    var keepPng = file.type === "image/png" && /\.png$/i.test(img.dataset.origSrc); // logos keep transparency
    var maxSide = img.dataset.editImg === "logo" ? 800 : 1800;
    var reader = new FileReader();
    reader.onload = function () {
      var im = new Image();
      im.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
        var w = Math.round(im.naturalWidth * scale), h = Math.round(im.naturalHeight * scale);
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(im, 0, 0, w, h);
        var mime = keepPng ? "image/png" : "image/webp";
        var data = c.toDataURL(mime, 0.82);
        if (!keepPng && data.indexOf("data:image/webp") !== 0) { mime = "image/jpeg"; data = c.toDataURL(mime, 0.85); }
        msg.textContent = "Uploading picture…";
        fetch("/admin/media", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mime: mime, data: data.split(",")[1], w: w, h: h }) })
          .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Upload failed"); return d; }); })
          .then(function (d) {
            var alt = prompt("Describe the picture in a few words (helps Google and people using screen readers):", img.getAttribute("alt") || "");
            if (alt === null) alt = img.getAttribute("alt") || "";
            var k = "img:" + img.dataset.editImg;
            document.querySelectorAll('img[data-edit-img="' + img.dataset.editImg + '"]').forEach(function (o) { o.src = d.src; o.alt = alt; });
            img.classList.add("ge-changed");
            dirty[k] = { src: d.src, alt: alt, w: w, h: h };
            update();
            msg.textContent = "Picture ready. Click Save changes to put it on the live site.";
          })
          .catch(function (x) { msg.textContent = x.message; });
      };
      im.onerror = function () { msg.textContent = "That file couldn't be read as a picture."; };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
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
    imgs.forEach(function (img) { if (dirty["img:" + img.dataset.editImg]) { img.src = img.dataset.origSrc; img.alt = img.dataset.origAlt; img.classList.remove("ge-changed"); } });
    dirty = {}; update();
  });

  saveBtn.addEventListener("click", function () {
    saveBtn.disabled = true; msg.textContent = "Saving…";
    fetch("/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: PAGE, changes: dirty }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Could not save"); return d; }); })
      .then(function () {
        els.forEach(function (el) { el.dataset.orig = el.innerHTML; el.classList.remove("ge-changed"); });
        imgs.forEach(function (img) { img.dataset.origSrc = img.getAttribute("src"); img.dataset.origAlt = img.getAttribute("alt") || ""; img.classList.remove("ge-changed"); });
        dirty = {}; update(); msg.textContent = "Saved. The live site is updated.";
      })
      .catch(function (x) { msg.textContent = x.message; saveBtn.disabled = false; });
  });

  window.addEventListener("beforeunload", function (e) { if (count) { e.preventDefault(); e.returnValue = ""; } });
  update();
})();
