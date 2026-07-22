const ATLAS = {
  brand: "Atlas & Co.",
  tagline: "Trail gear for long days outside",
};

function markActiveNav() {
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const href = (link.getAttribute("href") || "").replace(/^\//, "").toLowerCase();
    if (href === path || (path === "" && href === "index.html")) {
      link.classList.add("is-active");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
  markActiveNav();
});

async function postJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

function money(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function productCard(product) {
  const img = product.image
    ? `<img src="${product.image}" alt="${product.name}" loading="lazy">`
    : "";
  return `
    <article class="product">
      <div class="product-media">${img}</div>
      <div class="product-body">
        <div class="product-cat">${product.category || "Gear"}</div>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-price">${money(product.price)}</p>
      </div>
    </article>
  `;
}

function renderProducts(target, products) {
  if (!target) return;
  if (!products || !products.length) {
    target.innerHTML = `<p class="result-meta">No products matched that search.</p>`;
    return;
  }
  target.innerHTML = products.map(productCard).join("");
}

window.ATLAS = ATLAS;
window.money = money;
window.productCard = productCard;
window.renderProducts = renderProducts;
window.postJson = postJson;
window.getJson = getJson;
