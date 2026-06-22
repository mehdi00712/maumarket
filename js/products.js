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
const featuredShops = document.getElementById("featuredShops");
const featuredShopsSection = document.getElementById("featuredShopsSection");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileNav = document.getElementById("mobileNav");

let allItems = [];
let shopCache = {};

const params = new URLSearchParams(window.location.search);
const urlCategory = params.get("category");
const urlSearch = params.get("search");

if (urlCategory && categoryFilter) categoryFilter.value = urlCategory;
if (urlSearch && searchInput) searchInput.value = urlSearch;

mobileMenuBtn?.addEventListener("click", () => {
  mobileNav?.classList.toggle("show");
});

async function loadTopBanner() {
  if (!topAdBanner) return;

  try {
    const q = query(collection(db, "banners"), where("active", "==", true));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      topAdBanner.style.display = "none";
      return;
    }

    const banners = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    banners.sort((a, b) => {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    const banner = banners[0];

    if (!banner.imageUrl || !banner.shopId) {
      topAdBanner.style.display = "none";
      return;
    }

    topAdBanner.innerHTML = `
      <div class="top-ad-inner compact-ad">
        <img src="${escapeHtml(banner.imageUrl)}" alt="${escapeHtml(banner.title || "Featured shop")}">

        <div class="top-ad-content">
          <span>Featured Shop</span>
          <h2>${escapeHtml(banner.title || banner.shopName || "Featured Seller")}</h2>
          <p>${escapeHtml(banner.subtitle || banner.shopName || "Discover this MauMarket seller.")}</p>
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

      window.location.href = `shop.html?id=${encodeURIComponent(banner.shopId)}`;
    };
  } catch (error) {
    console.warn("Banner not loaded:", error.message);
    topAdBanner.style.display = "none";
  }
}

async function loadItems() {
  productsGrid.innerHTML = `
    <div class="order-card">
      Loading marketplace...
    </div>
  `;

  try {
    const q = query(collection(db, "products"), where("active", "==", true));
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

    renderItems(false);
    renderFeaturedShops();
  } catch (error) {
    productsGrid.innerHTML = `
      <div class="order-card">
        <h3>Marketplace could not load</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

async function getShop(sellerId) {
  if (!sellerId) {
    return {
      id: "",
      shopName: "Unknown Shop",
      verified: false,
      averageRating: 0,
      totalReviews: 0
    };
  }

  if (shopCache[sellerId]) return shopCache[sellerId];

  try {
    const shopSnap = await getDoc(doc(db, "shops", sellerId));

    if (shopSnap.exists()) {
      shopCache[sellerId] = {
        id: sellerId,
        verified: true,
        averageRating: 0,
        totalReviews: 0,
        ...shopSnap.data()
      };
    } else {
      shopCache[sellerId] = {
        id: sellerId,
        shopName: "Unknown Shop",
        verified: false,
        averageRating: 0,
        totalReviews: 0
      };
    }
  } catch (error) {
    shopCache[sellerId] = {
      id: sellerId,
      shopName: "Unknown Shop",
      verified: false,
      averageRating: 0,
      totalReviews: 0
    };
  }

  return shopCache[sellerId];
}

function renderFeaturedShops() {
  if (!featuredShops || !featuredShopsSection) return;

  const uniqueShops = {};

  allItems.forEach((item) => {
    if (item.sellerId && item.shop) {
      uniqueShops[item.sellerId] = {
        id: item.sellerId,
        ...item.shop
      };
    }
  });

  const shops = Object.values(uniqueShops)
    .sort((a, b) => Number(b.averageRating || 0) - Number(a.averageRating || 0))
    .slice(0, 12);

  if (shops.length === 0) {
    featuredShopsSection.style.display = "none";
    return;
  }

  featuredShopsSection.style.display = "block";
  featuredShops.innerHTML = "";

  shops.forEach((shop) => {
    const rating = Number(shop.averageRating || 0);
    const totalReviews = Number(shop.totalReviews || 0);

    const card = document.createElement("a");
    card.className = "featured-shop-card";
    card.href = `shop.html?id=${encodeURIComponent(shop.id)}`;

    card.innerHTML = `
      ${
        shop.logoUrl
          ? `<img src="${escapeHtml(shop.logoUrl)}" alt="${escapeHtml(shop.shopName || "Shop")}">`
          : `<div class="shop-logo-fallback">Shop</div>`
      }

      <strong>${escapeHtml(shop.shopName || "Shop")}</strong>
      <span>✓ Verified</span>
      <small>${rating > 0 ? `⭐ ${rating.toFixed(1)} (${totalReviews})` : "No reviews yet"}</small>
    `;

    featuredShops.appendChild(card);
  });
}

function renderItems(shouldScroll = false) {
  const search = (searchInput?.value || "").toLowerCase().trim();
  const type = typeFilter?.value || "";
  const category = categoryFilter?.value || "";
  const sort = sortFilter?.value || "newest";

  let filtered = allItems.filter((item) => {
    const searchableText = `
      ${item.title || ""}
      ${item.description || ""}
      ${item.category || ""}
      ${item.type || ""}
      ${item.shop?.shopName || ""}
      ${item.price || ""}
    `.toLowerCase();

    const matchesSearch = !search || searchableText.includes(search);
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
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
  }

  if (sort === "rating") {
    filtered.sort((a, b) => {
      return Number(b.averageRating || 0) - Number(a.averageRating || 0);
    });
  }

  if (resultCount) {
    resultCount.textContent = search
      ? `${filtered.length} result(s) for "${search}"`
      : `${filtered.length} result(s) found`;
  }

  if (filtered.length === 0) {
    productsGrid.innerHTML = `
      <div class="order-card">
        <h3>No items found</h3>
        <p>${search ? `No result for "${escapeHtml(search)}".` : "Try another search, category, or filter."}</p>
      </div>
    `;

    if (shouldScroll) {
      productsGrid.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    return;
  }

  productsGrid.innerHTML = "";

  filtered.forEach((item) => {
    const productRating = Number(item.averageRating || 0);
    const productReviews = Number(item.totalReviews || 0);
    const shopRating = Number(item.shop?.averageRating || 0);
    const shopReviews = Number(item.shop?.totalReviews || 0);
    const sold = Number(item.soldCount || 0);

    const ratingText = productRating > 0
      ? `⭐ ${productRating.toFixed(1)} (${productReviews})`
      : "⭐ No reviews yet";

    const sellerRatingText = shopRating > 0
      ? `Seller ⭐ ${shopRating.toFixed(1)} (${shopReviews})`
      : "Seller not rated yet";

    const div = document.createElement("div");
    div.className = "market-product-card";

    div.innerHTML = `
      <a class="market-product-img" href="product-details.html?id=${encodeURIComponent(item.id)}">
        ${
          item.imageUrl
            ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Product")}">`
            : `<div class="no-img">No Image</div>`
        }
      </a>

      <div class="market-product-body">
        <span class="badge">${escapeHtml(item.type || "item")}</span>

        <h3>${escapeHtml(item.title || "Untitled")}</h3>

        <p class="seller-line">
          <span>✓ Verified</span>
          ${escapeHtml(item.shop?.shopName || "Shop")}
        </p>

        <p class="rating-line-small">${ratingText}</p>
        <p class="rating-line-small muted">${sellerRatingText}${sold > 0 ? ` • ${sold} sold` : ""}</p>

        <p class="price">Rs ${Number(item.price || 0)}</p>

        <a class="btn product-main-btn" href="product-details.html?id=${encodeURIComponent(item.id)}">
          View
        </a>
      </div>
    `;

    productsGrid.appendChild(div);
  });

  if (shouldScroll) {
    productsGrid.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function runSearch() {
  renderItems(true);
}

searchInput?.addEventListener("input", () => {
  renderItems(false);
});

searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
});

typeFilter?.addEventListener("change", runSearch);
categoryFilter?.addEventListener("change", runSearch);
sortFilter?.addEventListener("change", runSearch);

searchBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  runSearch();
});

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadTopBanner();
loadItems();
