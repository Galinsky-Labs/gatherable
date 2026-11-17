(function () {
  var sec = document.getElementById("checklist");
  if (!sec) return;
  var btn = document.getElementById("buy-btn"), err = document.getElementById("buy-error");
  var product = null;
  function money(c, cur) { return (c / 100).toLocaleString("en-US", { style: "currency", currency: (cur || "usd").toUpperCase(), minimumFractionDigits: c % 100 ? 2 : 0 }); }

  fetch("/api/products").then(function (r) { return r.json(); }).then(function (d) {
    product = (d.products || [])[0];
    if (!product) return;
    document.getElementById("buy-title").textContent = product.title;
    document.getElementById("buy-desc").textContent = product.description;
    document.getElementById("buy-price").textContent = money(product.price_cents, product.currency);
    btn.textContent = "Get the checklist · " + money(product.price_cents, product.currency) + " →";
    sec.hidden = false;
    if (location.hash === "#checklist") sec.scrollIntoView();
  }).catch(function () {});

  btn.addEventListener("click", function () {
    if (!product) return;
    err.hidden = true; btn.disabled = true; btn.textContent = "Opening secure checkout…";
    fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: product.slug }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.url) throw new Error(d.error || "Checkout isn't available right now."); return d; }); })
      .then(function (d) { location.href = d.url; })
      .catch(function (x) {
        err.textContent = x.message; err.hidden = false; btn.disabled = false;
        btn.textContent = "Get the checklist · " + money(product.price_cents, product.currency) + " →";
      });
  });
})();
