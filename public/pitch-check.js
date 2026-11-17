(function () {
  var form = document.getElementById("pc-form");
  var fileInput = document.getElementById("p-file"), drop = document.getElementById("drop"), chip = document.getElementById("file-chip");
  var err = document.getElementById("pc-error"), submit = document.getElementById("pc-submit");
  var loading = document.getElementById("pc-loading"), stage = document.getElementById("pc-stage"), out = document.getElementById("pc-result");
  var file = null;
  var MAX = 15 * 1024 * 1024;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fail(m) { err.textContent = m; err.hidden = false; }

  function setFile(f) {
    err.hidden = true;
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { file = null; chip.hidden = true; return fail("Please choose a PDF. Export your deck from PowerPoint, Keynote or Google Slides as PDF."); }
    if (f.size > MAX) { file = null; chip.hidden = true; return fail("That file is over 15 MB. Try exporting a smaller PDF (reduce image quality)."); }
    file = f;
    chip.textContent = "📄 " + f.name + " · " + (f.size / 1048576).toFixed(1) + " MB";
    chip.hidden = false;
  }
  fileInput.addEventListener("change", function () { setFile(fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { setFile(e.dataTransfer.files[0]); });

  function toBase64(f) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = function () { reject(new Error("Couldn't read that file.")); };
      r.readAsDataURL(f);
    });
  }

  var stages = ["Reading your document…", "Checking differentiation and relevance…", "Weighing the strategy and the idea…", "Looking for proof points…", "Writing your top fixes…"];
  var timer;
  function startStages() { var i = 0; stage.textContent = stages[0]; timer = setInterval(function () { i = Math.min(i + 1, stages.length - 1); stage.textContent = stages[i]; }, 18000); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.hidden = true;
    var el = form.elements; var name = el["name"].value.trim(), email = el["email"].value.trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Please enter your name and a valid email.");
    if (!file) return fail("Please add your PDF.");
    if (!document.getElementById("p-consent").checked) return fail("Please tick the box to confirm you can share this document.");
    submit.disabled = true;
    toBase64(file).then(function (data) {
      form.hidden = true; loading.hidden = false; startStages();
      return fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name, email: email, company: el["company"].value, role: el["role"].value,
          docType: el["docType"].value, context: el["context"].value, consent: true,
          file: { name: file.name, data: data },
        }),
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 503 && d.error === "not_configured") throw new Error("The Pitch Check is being set up and will be back shortly. Email your deck to galinsky.george@gmail.com and George will take a look.");
        if (!r.ok) throw new Error(d.error || "Something went wrong. Please try again.");
        return d.result;
      });
    }).then(render).catch(function (x) {
      clearInterval(timer); loading.hidden = true; form.hidden = false; submit.disabled = false;
      fail(x.message);
    });
  });

  function render(r) {
    clearInterval(timer);
    loading.hidden = true;
    var score = Math.max(0, Math.min(100, Number(r.overall_score) || 0));
    var bars = (r.scores || []).map(function (s) {
      var v = Math.max(0, Math.min(10, Number(s.score) || 0));
      return '<div class="bar-row"><span>' + esc(s.criterion) + '</span><span class="bar"><i style="width:' + v * 10 + '%"></i></span><b>' + v + '</b>' +
        '<details><summary>Why</summary><p>' + esc(s.rationale) + "</p></details></div>";
    }).join("");
    var fixes = (r.top_fixes || []).map(function (f, i) {
      return '<div class="fix"><h4>' + (i + 1) + ". " + esc(f.title) + "</h4><p><b>Why it matters:</b> " + esc(f.why) + "</p><p><b>How:</b> " + esc(f.how) + "</p></div>";
    }).join("");
    var list = function (a) { return "<ul>" + (a || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"; };
    out.innerHTML =
      '<div class="result-head"><div class="ring" style="--p:' + score + '"><span>' + score + "<small>/100</small></span></div>" +
      '<div><span class="eyebrow">Your Pitch Check</span><h2 style="font-size:1.45rem;margin:0">' + esc(r.headline) + "</h2></div></div>" +
      '<p class="form-note">' + esc(r.doc_summary) + "</p>" +
      "<h3>Scorecard</h3><div class=\"bars\">" + bars + "</div>" +
      "<h3>Top 3 fixes</h3>" + fixes +
      "<h3>What's working</h3>" + list(r.strengths) +
      "<h3>Questions the client will ask</h3>" + list(r.client_questions) +
      '<div class="cta-box"><h3 style="margin-top:0;color:#fff">Want George to go deeper?</h3><p>This is an AI first read. In a meeting George reviews the deck himself, pressure-tests the strategy, and can coach your team through rehearsal.</p>' +
      '<a class="btn btn-light" href="/?role=agency&topic=pitch#contact">Book a meeting with George →</a></div>' +
      '<p class="disclaimer">Generated by AI using Gatherable\'s review criteria. It can miss context only your team knows, so treat it as a first pass, not a final verdict. <a href="/pitch-check">Check another document</a>.</p>';
    out.hidden = false;
    out.focus();
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
