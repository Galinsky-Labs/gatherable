(function () {
  var sec = document.getElementById("checklist");
  if (!sec) return;
  var wrap = document.getElementById("buy-cards"), err = document.getElementById("buy-error");
  function money(c, cur) { return (c / 100).toLocaleString("en-US", { style: "currency", currency: (cur || "usd").toUpperCase(), minimumFractionDigits: c % 100 ? 2 : 0 }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  fetch("/api/products").then(function (r) { return r.json(); }).then(function (d) {
    var list = d.products || [];
    if (!list.length) return;
    list.forEach(function (p) {
      var card = el("div", "buy-card");
      card.appendChild(el("span", "eyebrow", "Instant download"));
      card.appendChild(el("h3", null, p.title));
      if (p.description) card.appendChild(el("p", "buy-desc", p.description));
      card.appendChild(el("p", "price", money(p.price_cents, p.currency)));
      var btn = el("button", "btn btn-primary", "Get the checklist →");
      btn.type = "button";
      btn.addEventListener("click", function () { buy(p, btn); });
      card.appendChild(btn);
      card.appendChild(el("p", "fine", "Secure checkout by Stripe. Download right after payment."));
      wrap.appendChild(card);
    });
    sec.hidden = false;
    if (location.hash === "#checklist") sec.scrollIntoView();
  }).catch(function () {});

  function buy(p, btn) {
    err.hidden = true; btn.disabled = true; btn.textContent = "Opening secure checkout…";
    fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: p.slug }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.url) throw new Error(d.error || "Checkout isn't available right now."); return d; }); })
      .then(function (d) { location.href = d.url; })
      .catch(function (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = "Get the checklist →"; });
  }
})();
