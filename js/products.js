import { db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const productsGrid = document.getElementById("productsGrid");
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const categoryFilter = document.getElementById("categoryFilter");
const sortFilter = document.getElementById("sortFilter");
const resultCount = document.getElementById("resultCount");
const searchBtn = document.getElementById("searchBtn");
const topAdBanner = document.getElementById("topAdBanner");

let allItems = [];
let shopCache = {};

const params = new URLSearchParams(window.location.search);
const urlCategory = params.get("category");

if (urlCategory && categoryFilter) {
  categoryFilter.value = urlCategory;
}

async function loadTopBanner() {
  if (!topAdBanner) return;

  try {
    const q = query(
      collection(db, "banners"),
      where("active", "==", true)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      topAdBanner.style.display = "none";
      return;
    }

    const banners = [];

    snapshot.forEach((docSnap) => {
      banners.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    banners.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    const banner = banners[0];

    if (!banner.imageUrl || !banner.shopId) {
      topAdBanner.style.display = "none";
      return;
    }

    topAdBanner.innerHTML = `
      <div class="top-ad-inner">
        <img src="${banner.imageUrl}" alt="${banner.title || "Featured shop"}">

        <div class="top-ad-content">
          <span>Featured Shop</span>
          <h2>${banner.title || banner.shopName || "Featured Seller"}</h2>
          <p>${banner.subtitle || banner.shopName || "Discover this MauMarket seller."}</p>
          <button type="button">Visit Shop</button>
        </div>
      </div>
    `;

    topAdBanner.onclick = async () => {
      try {
        await updateDoc(doc(db, "banners", banner.id), {
          clicks: increment(1)
        });
      } catch (error) {
        console.warn("Could not update banner clicks:", error.message);
      }

      window.location.href = `shop.html?id=${banner.shopId}`;
    };
  } catch (error) {
    console.warn("Banner not loaded:", error.message);
    topAdBanner.style.display = "none";
  }
}

async function loadItems() {
  productsGrid.innerHTML = `<div class="order-card">Loading marketplace...</div>`;

  try {
    const q = query(
      collection(db, "products"),
      where("active", "==", true)
    );

    const snapshot = await getDocs(q);

    allItems = [];

    for (const docSnap of snapshot.docs) {
      const item = {
        id: docSnap.id,
        ...docSnap.data()
      };

      item.shop = await getShop(item.sellerId);
      allItems.push(item);
    }

    renderItems();
  } catch (error) {
    productsGrid.innerHTML = `
      <div class="order-card">
        <h3>Marketplace could not load</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

async function getShop(sellerId) {
  if (!sellerId) {
    return { shopName: "Unknown Shop" };
  }

  if (shopCache[sellerId]) return shopCache[sellerId];

  try {
    const shopSnap = await getDoc(doc(db, "shops", sellerId));

    if (shopSnap.exists()) {
      shopCache[sellerId] = shopSnap.data();
    } else {
      shopCache[sellerId] = {
        shopName: "Unknown Shop"
      };
    }
  } catch (error) {
    shopCache[sellerId] = {
      shopName: "Unknown Shop"
    };
  }

  return shopCache[sellerId];
}

function renderItems() {
  const search = (searchInput?.value || "").toLowerCase().trim();
  const type = typeFilter?.value || "";
  const category = categoryFilter?.value || "";
  const sort = sortFilter?.value || "newest";

  let filtered = allItems.filter((item) => {
    const matchesSearch =
      !search ||
      item.title?.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search) ||
      item.type?.toLowerCase().includes(search) ||
      item.shop?.shopName?.toLowerCase().includes(search);

    const matchesType = !type || item.type === type;
    const matchesCategory = !category || item.category === category;

    return matchesSearch && matchesType && matchesCategory;
  });

  if (sort === "low-high") {
    filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  }

  if (sort === "high-low") {
    filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }

  if (sort === "newest") {
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });
  }

  if (resultCount) {
    resultCount.textContent = `${filtered.length} result(s) found`;
  }

  if (filtered.length === 0) {
    productsGrid.innerHTML = `
      <div class="order-card">
        <h3>No items found</h3>
        <p>Try another search, category, or filter.</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = "";

  filtered.forEach((item) => {
    const div = document.createElement("div");
    div.className = "card product-card";

    div.innerHTML = `
      <div class="product-img-wrap">
        ${
          item.imageUrl
            ? `<img src="${item.imageUrl}" alt="${item.title || "Product"}">`
            : `<div class="no-img">No Image</div>`
        }
      </div>

      <span class="badge">${item.type || "item"}</span>

      <h3>${item.title || "Untitled"}</h3>

      <p class="muted">${item.category || "Other"}</p>
      <p class="muted">Sold by ${item.shop?.shopName || "Shop"}</p>

      <p class="price">Rs ${Number(item.price || 0)}</p>

      <a class="btn" href="product-details.html?id=${item.id}">View Details</a>
      <a class="small-link" href="shop.html?id=${item.sellerId}">Visit Shop</a>
    `;

    productsGrid.appendChild(div);
  });
}

searchInput?.addEventListener("input", renderItems);
typeFilter?.addEventListener("change", renderItems);
categoryFilter?.addEventListener("change", renderItems);
sortFilter?.addEventListener("change", renderItems);

if (searchBtn) {
  searchBtn.addEventListener("click", renderItems);
}

loadTopBanner();
loadItems();
