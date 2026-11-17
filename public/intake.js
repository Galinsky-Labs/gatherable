(function () {
  // Mobile menu
  var btn = document.querySelector(".menu-btn"), menu = document.getElementById("menu");
  if (btn) {
    btn.addEventListener("click", function () { var o = menu.classList.toggle("open"); btn.setAttribute("aria-expanded", o); });
    menu.addEventListener("click", function (e) { if (e.target.tagName === "A") { menu.classList.remove("open"); btn.setAttribute("aria-expanded", false); } });
  }

  var form = document.getElementById("intake-form");
  if (!form) return;

  var TOPICS = {
    agency: [
      ["pitch", "An upcoming pitch, RFP or credentials presentation"],
      ["newbiz", "Growing our new business pipeline"],
      ["relationship", "Repairing or strengthening a client relationship"],
      ["agency_strategy", "A second opinion on strategy or creative for a client"],
      ["other", "Something else"],
    ],
    brand: [
      ["search", "Finding a new agency (running a review)"],
      ["evaluate", "Evaluating finalist agencies we already have"],
      ["brand_strategy", "Strategy, creative or media advice"],
      ["research", "Consumer or stakeholder research"],
      ["other", "Something else"],
    ],
  };
  var DETAILS = {
    pitch: [
      ["deadline", "When is the pitch or deadline?", "text", "e.g. RFP due March 3, finals mid-April"],
      ["prospect", "Prospective client or category", "text", "e.g. regional health system"],
      ["stage", "Where are you in the process?", "select", ["RFP or questionnaire received", "Credentials round", "Shortlisted / finalist", "Preparing ahead of any RFP"]],
      ["help", "What would help most?", "select", ["Review of our response or deck", "Rehearsal coaching", "Strategy & positioning", "All of the above"]],
    ],
    newbiz: [
      ["agency_size", "Agency size", "select", ["Under 25 people", "25–100", "100–250", "250+"]],
      ["challenge", "What's working and what isn't?", "textarea", "e.g. lots of RFPs, low win rate"],
    ],
    relationship: [
      ["tenure", "How long have you had the account?", "text", "e.g. 4 years"],
      ["situation", "What's happening?", "textarea", "e.g. new CMO, account under review"],
    ],
    agency_strategy: [
      ["work", "What's the work?", "text", "e.g. brand campaign for a resort client"],
      ["deadline", "When does it go to the client?", "text", ""],
    ],
    search: [
      ["timing", "When do you want an agency in place?", "select", ["Within 3 months", "3–6 months", "6–12 months", "Just exploring"]],
      ["scope", "Which agency roles?", "text", "e.g. creative AOR, media, PR, digital"],
      ["budget", "Approximate annual marketing budget", "select", ["Under $500K", "$500K–$2M", "$2M–$10M", "$10M+", "Prefer not to say"]],
      ["current", "Current agency situation", "select", ["No agency today", "Incumbent agency, open to change", "Incumbent agency, contract ending", "Multiple agencies to consolidate"]],
    ],
    evaluate: [
      ["finalists", "How many finalists?", "text", "e.g. 3"],
      ["decision", "When do you need to decide?", "text", ""],
    ],
    brand_strategy: [
      ["category", "Industry or category", "text", "e.g. hospitality, sports, retail"],
      ["challenge", "What's the challenge?", "textarea", "e.g. launch, repositioning, falling sales"],
    ],
    research: [
      ["audience", "Who do you need to hear from?", "text", "e.g. customers, internal stakeholders"],
      ["goal", "What decision will the research inform?", "textarea", ""],
    ],
    other: [],
  };

  var steps = form.querySelectorAll("fieldset");
  var dots = document.querySelectorAll(".progress li");
  var back = document.getElementById("back"), next = document.getElementById("next");
  var err = document.getElementById("intake-error");
  var cur = 1;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function val(name) { var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]'); return el && (el.type !== "radio" || el.checked) ? el.value : ""; }

  function renderTopics(preset) {
    var role = val("role");
    document.getElementById("topic-choices").innerHTML = (TOPICS[role] || TOPICS.agency).map(function (t) {
      return '<label class="choice"><input type="radio" name="topic" value="' + t[0] + '"' + (t[0] === preset ? " checked" : "") + ' required><span><b>' + esc(t[1]) + "</b></span></label>";
    }).join("");
  }
  function renderDetails() {
    var qs = DETAILS[val("topic")] || [];
    document.getElementById("detail-fields").innerHTML = qs.length ? qs.map(function (q) {
      var id = "d-" + q[0], field;
      if (q[2] === "select") field = '<select id="' + id + '" data-q="' + q[0] + '"><option value="">Choose one</option>' + q[3].map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select>";
      else if (q[2] === "textarea") field = '<textarea id="' + id + '" data-q="' + q[0] + '" placeholder="' + esc(q[3]) + '"></textarea>';
      else field = '<input id="' + id + '" data-q="' + q[0] + '" placeholder="' + esc(q[3]) + '">';
      return '<div class="' + (q[2] === "textarea" ? "full" : "") + '"><label for="' + id + '">' + esc(q[1]) + "</label>" + field + "</div>";
    }).join("") : '<p class="full form-note">No specifics needed. Tell George about it on the next step.</p>';
  }
  function show(n) {
    cur = n;
    steps.forEach(function (f) { f.hidden = Number(f.dataset.step) !== n; });
    dots.forEach(function (d, i) { d.classList.toggle("on", i < n); });
    back.hidden = n === 1;
    next.textContent = n === 4 ? "Send my request →" : "Continue →";
    err.hidden = true;
    var first = steps[n - 1].querySelector("input,select,textarea");
    if (first && n > 1) first.focus({ preventScroll: true });
  }
  function fail(msg) { err.textContent = msg; err.hidden = false; }

  form.addEventListener("change", function (e) {
    if (e.target.name === "role") { renderTopics(); show(2); }
    else if (e.target.name === "topic") { renderDetails(); show(3); }
  });
  back.addEventListener("click", function () { show(cur - 1); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (cur === 1) { if (!val("role")) return fail("Choose one to continue."); renderTopics(); return show(2); }
    if (cur === 2) { if (!val("topic")) return fail("Choose one to continue."); renderDetails(); return show(3); }
    if (cur === 3) return show(4);
    var name = val("name").trim(), email = val("email").trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Please enter your name and a valid email.");
    var answers = {};
    form.querySelectorAll("[data-q]").forEach(function (el) { if (el.value) answers[el.dataset.q] = el.value; });
    next.disabled = true; next.textContent = "Sending…";
    fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: val("role"), topic: val("topic"), answers: answers, name: name, email: email, company: val("company"), phone: val("phone"), message: val("message"), website: val("website") }),
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Something went wrong."); return d; }); })
      .then(function (d) {
        form.hidden = true;
        document.querySelector(".progress").hidden = true;
        var rec = d.recommendation || {};
        document.getElementById("rec-service").textContent = rec.service || "Intro meeting";
        document.getElementById("rec-note").textContent = rec.note || "";
        document.getElementById("rec-extra").hidden = val("role") !== "agency";
        var done = document.getElementById("intake-done"); done.hidden = false; done.focus();
      })
      .catch(function (x) {
        fail(x.message + " You can also email galinsky.george@gmail.com directly.");
        next.disabled = false; next.textContent = "Send my request →";
      });
  });

  // Buttons elsewhere on the page that pre-select a path
  document.querySelectorAll("[data-role]").forEach(function (a) {
    a.addEventListener("click", function () {
      var r = form.querySelector('input[name="role"][value="' + a.dataset.role + '"]');
      if (!r) return;
      r.checked = true; renderTopics(a.dataset.topic); renderDetails(); show(3);
    });
  });
  // Deep link: /#contact?topic=pitch handled via ?topic= query
  var q = new URLSearchParams(location.search);
  if (q.get("role") && TOPICS[q.get("role")]) {
    form.querySelector('input[name="role"][value="' + q.get("role") + '"]').checked = true;
    renderTopics(q.get("topic")); if (val("topic")) { renderDetails(); show(3); } else show(2);
  }
})();
