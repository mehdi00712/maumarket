import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const adminProductsList = document.getElementById("adminProductsList");

const totalListings = document.getElementById("totalListings");
const activeListings = document.getElementById("activeListings");
const hiddenListings = document.getElementById("hiddenListings");
const productListings = document.getElementById("productListings");
const serviceListings = document.getElementById("serviceListings");
const outOfStockListings = document.getElementById("outOfStockListings");

const productSearchInput = document.getElementById("productSearchInput");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");
const clearProductFiltersBtn = document.getElementById("clearProductFiltersBtn");
const productsResultCount = document.getElementById("productsResultCount");

let allProducts = [];

productSearchInput?.addEventListener("input", renderProducts);
typeFilter?.addEventListener("change", renderProducts);
statusFilter?.addEventListener("change", renderProducts);

clearProductFiltersBtn?.addEventListener("click", () => {
  if (productSearchInput) productSearchInput.value = "";
  if (typeFilter) typeFilter.value = "";
  if (statusFilter) statusFilter.value = "";
  renderProducts();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const adminSnap = await getDoc(doc(db, "users", user.uid));

    if (
      !adminSnap.exists() ||
      adminSnap.data().role !== "admin" ||
      adminSnap.data().blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    await loadProducts();
  } catch (error) {
    adminProductsList.innerHTML = `
      <div class="order-card">
        <h3>Could not load products</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
});

async function loadProducts() {
  adminProductsList.innerHTML = `
    <div class="order-card">
      Loading products...
    </div>
  `;

  try {
    let snapshot;

    try {
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
      snapshot = await getDocs(q);
    } catch (error) {
      snapshot = await getDocs(collection(db, "products"));
    }

    allProducts = [];

    snapshot.forEach((docSnap) => {
      allProducts.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    allProducts.sort((a, b) => {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    updateStats();
    renderProducts();
  } catch (error) {
    adminProductsList.innerHTML = `
      <div class="order-card">
        <h3>Could not load products</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function updateStats() {
  let active = 0;
  let hidden = 0;
  let products = 0;
  let services = 0;
  let outOfStock = 0;

  allProducts.forEach((item) => {
    if (item.active === false) hidden++;
    else active++;

    if (item.type === "service") services++;
    else products++;

    if (item.type !== "service" && Number(item.stock || 0) <= 0) {
      outOfStock++;
    }
  });

  if (totalListings) totalListings.textContent = allProducts.length;
  if (activeListings) activeListings.textContent = active;
  if (hiddenListings) hiddenListings.textContent = hidden;
  if (productListings) productListings.textContent = products;
  if (serviceListings) serviceListings.textContent = services;
  if (outOfStockListings) outOfStockListings.textContent = outOfStock;
}

function renderProducts() {
  const search = (productSearchInput?.value || "").toLowerCase().trim();
  const type = typeFilter?.value || "";
  const status = statusFilter?.value || "";

  const filtered = allProducts.filter((item) => {
    const searchable = `
      ${item.title || ""}
      ${item.description || ""}
      ${item.category || ""}
      ${item.type || ""}
      ${item.sellerId || ""}
      ${item.shopName || ""}
      ${item.serviceArea || ""}
    `.toLowerCase();

    const matchesSearch = !search || searchable.includes(search);
    const matchesType = !type || item.type === type;

    let matchesStatus = true;

    if (status === "active") {
      matchesStatus = item.active !== false;
    }

    if (status === "hidden") {
      matchesStatus = item.active === false;
    }

    return matchesSearch && matchesType && matchesStatus;
  });

  if (productsResultCount) {
    productsResultCount.textContent = `${filtered.length} listing(s)`;
  }

  if (filtered.length === 0) {
    adminProductsList.innerHTML = `
      <div class="order-card">
        <h3>No listings found</h3>
        <p>Try another search or filter.</p>
      </div>
    `;
    return;
  }

  adminProductsList.innerHTML = "";

  filtered.forEach((item) => {
    adminProductsList.appendChild(createProductCard(item));
  });
}

function createProductCard(item) {
  const div = document.createElement("div");
  div.className = "order-card";

  const isActive = item.active !== false;
  const isService = item.type === "service";
  const stock = Number(item.stock || 0);

  div.innerHTML = `
    <div class="admin-product-card-layout">
      <div>
        ${
          item.imageUrl
            ? `<img class="admin-thumb" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Listing")}">`
            : `<div class="admin-thumb no-img">No Image</div>`
        }
      </div>

      <div>
        <div class="section-row-title">
          <div>
            <h3>${escapeHtml(item.title || "Untitled")}</h3>
            <p class="muted">${escapeHtml(item.category || "No category")}</p>
          </div>

          <span class="${isActive ? "status-pill" : "status-danger"}">
            ${isActive ? "Active" : "Hidden"}
          </span>
        </div>

        <div class="order-grid">
          <div>
            <p><strong>Type:</strong> ${escapeHtml(item.type || "product")}</p>
            <p><strong>Price:</strong> Rs ${formatMoney(item.price || 0)}</p>
            <p><strong>Stock:</strong> ${isService ? "Service" : stock}</p>
          </div>

          <div>
            <p><strong>Seller ID:</strong> ${escapeHtml(item.sellerId || "Unknown")}</p>
            <p><strong>Shop:</strong> ${escapeHtml(item.shopName || "Unknown")}</p>
            <p><strong>Rating:</strong> ${Number(item.averageRating || 0).toFixed(1)} ⭐ (${Number(item.totalReviews || 0)})</p>
          </div>
        </div>

        <p>${escapeHtml(shortText(item.description || "No description provided.", 180))}</p>

        <div class="seller-actions">
          <a class="btn" href="product-details.html?id=${encodeURIComponent(item.id)}">View</a>
          <button class="toggle-btn">${isActive ? "Hide Listing" : "Show Listing"}</button>
          <button class="danger-btn">Delete</button>
        </div>
      </div>
    </div>
  `;

  div.querySelector(".toggle-btn")?.addEventListener("click", async () => {
    const nextActive = !isActive;

    const confirmed = confirm(
      nextActive
        ? "Show this listing again?"
        : "Hide this listing from the marketplace?"
    );

    if (!confirmed) return;

    await updateDoc(doc(db, "products", item.id), {
      active: nextActive,
      adminModerated: true,
      updatedAt: serverTimestamp()
    });

    await loadProducts();
  });

  div.querySelector(".danger-btn")?.addEventListener("click", async () => {
    if (!confirm("Delete this product/service permanently?")) return;

    await deleteDoc(doc(db, "products", item.id));
    await loadProducts();
  });

  return div;
}

function shortText(value, maxLength = 120) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
