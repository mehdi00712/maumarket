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
const searchInput2 = document.getElementById("searchInput2");

const searchBtn = document.getElementById("searchBtn");
const searchBtn2 = document.getElementById("searchBtn2");

const typeFilter = document.getElementById("typeFilter");

const topCategoryFilter = document.getElementById("topCategoryFilter");
const categoryFilter = document.getElementById("categoryFilter");
const sideCategoryFilter = document.getElementById("sideCategoryFilter");

const sortFilter = document.getElementById("sortFilter");
const sideSortFilter = document.getElementById("sideSortFilter");

const resultCount = document.getElementById("resultCount");
const topAdBanner = document.getElementById("topAdBanner");

const featuredShops = document.getElementById("featuredShops");
const featuredShopsSection = document.getElementById("featuredShopsSection");

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileNav = document.getElementById("mobileNav");

const categoryIconGrid = document.getElementById("categoryIconGrid");

let allItems = [];
let allCategories = [];
let shopCache = {};

let activeSearch = "";
let activeCategory = "";
let activeSort = "newest";

const params = new URLSearchParams(window.location.search);
const urlCategory = params.get("category") || "";
const urlSearch = params.get("search") || "";

activeCategory = urlCategory;
activeSearch = urlSearch;

if (searchInput) searchInput.value = activeSearch;
if (searchInput2) searchInput2.value = activeSearch;

mobileMenuBtn?.addEventListener("click", () => {
  mobileNav?.classList.toggle("show");
});

async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));

    allCategories = [];

    snapshot.forEach((docSnap) => {
      const category = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if (category.active !== false) {
        allCategories.push(category);
      }
    });

    allCategories.sort((a, b) => {
      const aOrder = Number(a.sortOrder || 0);
      const bOrder = Number(b.sortOrder || 0);

      if (aOrder !== bOrder) return aOrder - bOrder;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    renderCategoryDropdowns();
    renderCategoryIcons();
  } catch (error) {
    console.warn("Categories not loaded:", error.message);
    renderFallbackCategories();
  }
}

function renderCategoryDropdowns() {
  const dropdowns = [
    topCategoryFilter,
    categoryFilter,
    sideCategoryFilter
  ].filter(Boolean);

  dropdowns.forEach((select) => {
    select.innerHTML = `<option value="">All Categories</option>`;

    allCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.name || "";
      option.textContent = `${category.icon || ""} ${category.name || "Category"}`.trim();

      if (activeCategory === category.name) {
        option.selected = true;
      }

      select.appendChild(option);
    });

    select.value = activeCategory;
  });
}

function renderCategoryIcons() {
  if (!categoryIconGrid) return;

  const baseCategories = [
    {
      name: "",
      icon: "grid",
      label: "All Categories"
    },
    ...allCategories.map((category) => ({
      name: category.name || "",
      icon: getCategoryIconKey(category.name, category.icon),
      label: category.name || "Category"
    }))
  ];

  if (baseCategories.length === 1) {
    categoryIconGrid.innerHTML = `
      <button class="category-icon-card active" type="button" data-category="">
        ${svgIcon("grid")}
        <span>All Categories</span>
      </button>
    `;
    return;
  }

  categoryIconGrid.innerHTML = "";

  baseCategories.forEach((category) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-icon-card ${activeCategory === category.name ? "active" : ""}`;
    btn.dataset.category = category.name;

    btn.innerHTML = `
      ${svgIcon(category.icon)}
      <span>${escapeHtml(category.label)}</span>
    `;

    btn.addEventListener("click", () => {
      setCategory(category.name);
      runSearch(true);
    });

    categoryIconGrid.appendChild(btn);
  });
}

function renderFallbackCategories() {
  allCategories = [
    { name: "Beauty", icon: "beauty", sortOrder: 1 },
    { name: "Electronics", icon: "electronics", sortOrder: 2 },
    { name: "Fashion", icon: "fashion", sortOrder: 3 },
    { name: "Food", icon: "food", sortOrder: 4 },
    { name: "Hardware", icon: "hardware", sortOrder: 5 },
    { name: "Home", icon: "home", sortOrder: 6 },
    { name: "Services", icon: "services", sortOrder: 7 },
    { name: "Other", icon: "other", sortOrder: 8 }
  ];

  renderCategoryDropdowns();
  renderCategoryIcons();
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

    topAdBanner.style.display = "block";

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
  if (!productsGrid) return;

  productsGrid.innerHTML = `
    <div class="order-card">
      Loading marketplace...
    </div>
  `;

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
  syncControlsFromState();

  const search = activeSearch.toLowerCase().trim();
  const category = activeCategory;
  const sort = activeSort;
  const type = typeFilter?.value || "";

  let filtered = allItems.filter((item) => {
    const searchableText = `
      ${item.title || ""}
      ${item.description || ""}
      ${item.category || ""}
      ${item.type || ""}
      ${item.shop?.shopName || ""}
      ${item.price || ""}
      ${item.serviceArea || ""}
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
      ? `${filtered.length} result(s) for "${escapeHtml(search)}"`
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
      scrollToProducts();
    }

    return;
  }

  productsGrid.innerHTML = "";

  filtered.forEach((item) => {
    productsGrid.appendChild(createProductCard(item));
  });

  if (shouldScroll) {
    scrollToProducts();
  }
}

function createProductCard(item) {
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

  const location = item.shop?.location || item.serviceArea || "Mauritius";

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
      <div class="product-card-top-row">
        <span class="badge">${escapeHtml(item.type || "item")}</span>
        <span class="product-heart">♡</span>
      </div>

      <h3>${escapeHtml(item.title || "Untitled")}</h3>

      <p class="seller-line">
        <span>✓ Verified</span>
        ${escapeHtml(item.shop?.shopName || "Shop")}
      </p>

      <p class="rating-line-small">${ratingText}</p>
      <p class="rating-line-small muted">${sellerRatingText}${sold > 0 ? ` • ${sold} sold` : ""}</p>

      <p class="product-location">📍 ${escapeHtml(location)}</p>
      <p class="price">Rs ${Number(item.price || 0).toLocaleString("en-US")}</p>

      <a class="btn product-main-btn" href="product-details.html?id=${encodeURIComponent(item.id)}">
        View Details
      </a>
    </div>
  `;

  return div;
}

function runSearch(shouldScroll = true) {
  activeSearch = getSearchValue();
  activeCategory = getCategoryValue();
  activeSort = getSortValue();

  updateUrlState();
  renderCategoryIcons();
  renderItems(shouldScroll);
}

function getSearchValue() {
  return (searchInput2?.value || searchInput?.value || "").trim();
}

function getCategoryValue() {
  return (
    categoryFilter?.value ||
    sideCategoryFilter?.value ||
    topCategoryFilter?.value ||
    activeCategory ||
    ""
  );
}

function getSortValue() {
  return (
    sortFilter?.value ||
    sideSortFilter?.value ||
    activeSort ||
    "newest"
  );
}

function setSearch(value) {
  activeSearch = value || "";

  if (searchInput) searchInput.value = activeSearch;
  if (searchInput2) searchInput2.value = activeSearch;
}

function setCategory(value) {
  activeCategory = value || "";

  if (topCategoryFilter) topCategoryFilter.value = activeCategory;
  if (categoryFilter) categoryFilter.value = activeCategory;
  if (sideCategoryFilter) sideCategoryFilter.value = activeCategory;
}

function setSort(value) {
  activeSort = value || "newest";

  if (sortFilter) sortFilter.value = activeSort;
  if (sideSortFilter) sideSortFilter.value = activeSort;
}

function syncControlsFromState() {
  setSearch(activeSearch);
  setCategory(activeCategory);
  setSort(activeSort);
}

function updateUrlState() {
  const nextParams = new URLSearchParams();

  if (activeSearch) nextParams.set("search", activeSearch);
  if (activeCategory) nextParams.set("category", activeCategory);

  const nextUrl = nextParams.toString()
    ? `${window.location.pathname}?${nextParams.toString()}`
    : window.location.pathname;

  window.history.replaceState({}, "", nextUrl);
}

function scrollToProducts() {
  const target = document.getElementById("marketProducts") || productsGrid;

  target?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function attachSearchEvents() {
  searchInput?.addEventListener("input", () => {
    setSearch(searchInput.value);
    renderItems(false);
  });

  searchInput2?.addEventListener("input", () => {
    setSearch(searchInput2.value);
    renderItems(false);
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch(true);
    }
  });

  searchInput2?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch(true);
    }
  });

  searchBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    runSearch(true);
  });

  searchBtn2?.addEventListener("click", (event) => {
    event.preventDefault();
    runSearch(true);
  });
}

function attachFilterEvents() {
  topCategoryFilter?.addEventListener("change", () => {
    setCategory(topCategoryFilter.value);
    runSearch(true);
  });

  categoryFilter?.addEventListener("change", () => {
    setCategory(categoryFilter.value);
    runSearch(true);
  });

  sideCategoryFilter?.addEventListener("change", () => {
    setCategory(sideCategoryFilter.value);
    runSearch(true);
  });

  sortFilter?.addEventListener("change", () => {
    setSort(sortFilter.value);
    runSearch(true);
  });

  sideSortFilter?.addEventListener("change", () => {
    setSort(sideSortFilter.value);
    runSearch(true);
  });

  typeFilter?.addEventListener("change", () => {
    runSearch(true);
  });
}

function getCategoryIconKey(name, icon) {
  const value = String(icon || name || "").toLowerCase();

  if (value.includes("beauty")) return "beauty";
  if (value.includes("elect")) return "electronics";
  if (value.includes("fashion")) return "fashion";
  if (value.includes("food")) return "food";
  if (value.includes("hardware")) return "hardware";
  if (value.includes("home")) return "home";
  if (value.includes("service")) return "services";
  if (value.includes("car")) return "vehicles";
  if (value.includes("phone")) return "electronics";

  return "other";
}

function svgIcon(type) {
  const icons = {
    grid: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    beauty: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M8 21h8M9 21V9a3 3 0 0 1 6 0v12M7 11h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 5c2-3 4-3 6 0 2-3 4-3 6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    electronics: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="13" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M8 19h6M11 15v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <rect x="18" y="8" width="3" height="8" rx="1" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    fashion: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M9 4 6 6l-3 5 4 2 2-3v10h10V10l2 3 4-2-3-5-3-2-3 3h-4L9 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `,
    food: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M4 13h16a8 8 0 0 0-16 0Z" stroke="currentColor" stroke-width="2"/>
        <path d="M3 16h18M6 19h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 9h.01M13 7h.01M16 10h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `,
    hardware: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="m14 7 3-3 3 3-3 3M4 20l8-8M12 12l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="m5 5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    home: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M3 11 12 4l9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M5 10v10h14V10" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M10 20v-6h4v6" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    services: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="7" width="14" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M9 7V5h6v2M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    vehicles: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M5 16h14l-1.5-5h-11L5 16Z" stroke="currentColor" stroke-width="2"/>
        <circle cx="8" cy="18" r="1.5" stroke="currentColor" stroke-width="2"/>
        <circle cx="16" cy="18" r="1.5" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    other: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="5" cy="12" r="2" fill="currentColor"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
        <circle cx="19" cy="12" r="2" fill="currentColor"/>
      </svg>
    `
  };

  return icons[type] || icons.other;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

attachSearchEvents();
attachFilterEvents();

await loadCategories();
await loadTopBanner();
await loadItems();
