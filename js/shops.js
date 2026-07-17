import { db } from "./firebase-config.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  MauMarket shops.js
  ----------------------------------------------------------
  Powers shops.html:
  - Loads active/approved shops
  - Loads active marketplace listings
  - Counts listings per seller
  - Loads active categories
  - Search by shop name, description, category and location
  - Filter by category
  - Sort by featured, rating, listings, newest and alphabetical
  - Responsive premium shop cards
  - Personalized public shop links
  - Backward-compatible seller ID fallback
*/

const shopsGrid = document.getElementById("shopsGrid");
const shopsEmptyState = document.getElementById("shopsEmptyState");

const shopsSearchInput = document.getElementById("shopsSearchInput");
const shopsSearchBtn = document.getElementById("shopsSearchBtn");
const shopsCategoryFilter = document.getElementById("shopsCategoryFilter");
const shopsSortFilter = document.getElementById("shopsSortFilter");

const clearShopFiltersBtn = document.getElementById("clearShopFiltersBtn");
const shopsEmptyClearBtn = document.getElementById("shopsEmptyClearBtn");

const shopsCategoryList = document.getElementById("shopsCategoryList");

const shopsResultCount = document.getElementById("shopsResultCount");
const shopsDirectoryTitle = document.getElementById("shopsDirectoryTitle");

const shopsTotalCount = document.getElementById("shopsTotalCount");
const shopsListingsCount = document.getElementById("shopsListingsCount");
const featuredShopsCount = document.getElementById("featuredShopsCount");
const featuredShopsBanner = document.getElementById("featuredShopsBanner");
const shopsLoadingState = document.getElementById("shopsLoadingState");
const shopsErrorState = document.getElementById("shopsErrorState");
const retryShopsBtn = document.getElementById("retryShopsBtn");

let allShops = [];
let allListings = [];
let allCategories = [];
let featuredShops = [];

let activeSearch = "";
let activeCategory = "";
let activeSort = "featured";

const params = new URLSearchParams(window.location.search);

activeSearch = params.get("search") || "";
activeCategory = params.get("category") || "";
activeSort = params.get("sort") || "featured";

if (shopsSearchInput) shopsSearchInput.value = activeSearch;
if (shopsSortFilter) shopsSortFilter.value = activeSort;

attachEvents();

await loadCategories();
await loadShopsDirectory();

/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));

    allCategories = [];

    snapshot.forEach((docSnap) => {
      const category = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if (category.active !== false && category.name) {
        allCategories.push(category);
      }
    });

    allCategories.sort((a, b) => {
      const aOrder = Number(a.sortOrder || 0);
      const bOrder = Number(b.sortOrder || 0);

      if (aOrder !== bOrder) return aOrder - bOrder;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    renderCategoryControls();
  } catch (error) {
    console.warn("Could not load shop categories:", error.message);

    allCategories = [];
    renderCategoryControls();
  }
}

async function loadShopsDirectory() {
  showLoadingState();

  try {
    const [shopsSnapshot, listingsSnapshot] = await Promise.all([
      getDocs(collection(db, "shops")),
      getDocs(
        query(
          collection(db, "products"),
          where("active", "==", true)
        )
      )
    ]);

    allListings = listingsSnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    const listingStatsBySeller = buildListingStats(allListings);

    allShops = shopsSnapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        const ownerId = data.ownerId || data.sellerId || docSnap.id;
        const stats = listingStatsBySeller[ownerId] || emptyListingStats();

        return {
          id: docSnap.id,
          ownerId,
          sellerId: data.sellerId || ownerId,
          slug: normalizeShopSlug(
            data.slug ||
            data.shopSlug ||
            ""
          ),
          verified: data.verified !== false,
          active: data.active !== false,
          approved: data.approved !== false,
          featuredShop: data.featuredShop === true,
          featuredStatus: String(data.featuredStatus || "").toLowerCase(),
          showInExploreShops: data.showInExploreShops === true,
          featuredPaymentVerified: data.featuredPaymentVerified === true,
          featuredExpiry: data.featuredExpiry || null,
          averageRating: Number(data.averageRating || 0),
          totalReviews: Number(data.totalReviews || 0),
          ...data,
          ...stats
        };
      })
      .filter((shop) => {
        const expiry = timestampToDate(shop.featuredExpiry);

        return (
          shop.active !== false &&
          shop.approved !== false &&
          Boolean(shop.shopName) &&
          shop.featuredShop === true &&
          shop.featuredStatus === "active" &&
          shop.featuredPaymentVerified === true &&
          shop.showInExploreShops === true &&
          expiry &&
          expiry.getTime() > Date.now()
        );
      });

    featuredShops = [...allShops];

      updateHeroStats();
    renderShops();
  } catch (error) {
    console.error("Could not load shops directory:", error);

    if (shopsGrid) {
      shopsGrid.innerHTML = `
        <div class="empty-market-card">
          <h3>Shops could not load</h3>
          <p>${escapeHtml(error.message || "Please try again later.")}</p>
        </div>
      `;
    }

    if (shopsResultCount) {
      shopsResultCount.textContent = "Could not load shops.";
    }
  }
}

function buildListingStats(listings) {
  const stats = {};

  listings.forEach((item) => {
    const sellerId = item.sellerId || item.ownerId || "";

    if (!sellerId) return;

    if (!stats[sellerId]) {
      stats[sellerId] = emptyListingStats();
    }

    const sellerStats = stats[sellerId];

    sellerStats.listingCount += 1;

    if (item.type === "service") {
      sellerStats.serviceCount += 1;
    } else {
      sellerStats.productCount += 1;
    }

    if (item.category) {
      sellerStats.categories.add(item.category);
    }

    if (item.imageUrl && sellerStats.productImages.length < 3) {
      sellerStats.productImages.push(item.imageUrl);
    }

    const createdAt = Number(item.createdAt?.seconds || 0);

    if (createdAt > sellerStats.latestListingTime) {
      sellerStats.latestListingTime = createdAt;
    }
  });

  Object.values(stats).forEach((sellerStats) => {
    sellerStats.categories = Array.from(sellerStats.categories);
  });

  return stats;
}

function emptyListingStats() {
  return {
    listingCount: 0,
    productCount: 0,
    serviceCount: 0,
    categories: new Set(),
    productImages: [],
    latestListingTime: 0
  };
}

/* =========================================================
   CATEGORY CONTROLS
   ========================================================= */

function renderCategoryControls() {
  if (shopsCategoryFilter) {
    shopsCategoryFilter.innerHTML = `
      <option value="">All Categories</option>
    `;

    allCategories.forEach((category) => {
      const option = document.createElement("option");

      option.value = category.name;
      option.textContent = category.name;

      shopsCategoryFilter.appendChild(option);
    });

    ensureCategoryOption(activeCategory);
    shopsCategoryFilter.value = activeCategory;
  }

  if (!shopsCategoryList) return;

  shopsCategoryList.innerHTML = "";

  const allButton = createCategoryButton({
    name: "",
    label: "All Shops"
  });

  shopsCategoryList.appendChild(allButton);

  allCategories.forEach((category) => {
    shopsCategoryList.appendChild(
      createCategoryButton({
        name: category.name,
        label: category.name
      })
    );
  });
}

function createCategoryButton(category) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = `shops-category-btn ${
    activeCategory === category.name ? "active" : ""
  }`;

  button.innerHTML = `
    <span>${escapeHtml(category.label)}</span>
    <small>${getCategoryShopCount(category.name)}</small>
  `;

  button.addEventListener("click", () => {
    setCategory(category.name);
    renderCategoryControls();
    renderShops(true);
  });

  return button;
}

function getCategoryShopCount(categoryName) {
  if (!categoryName) return allShops.length;

  return allShops.filter((shop) => {
    return getShopCategories(shop).includes(categoryName);
  }).length;
}

function ensureCategoryOption(categoryName) {
  if (!shopsCategoryFilter || !categoryName) return;

  const exists = Array.from(shopsCategoryFilter.options).some(
    (option) => option.value === categoryName
  );

  if (!exists) {
    const option = document.createElement("option");

    option.value = categoryName;
    option.textContent = categoryName;

    shopsCategoryFilter.appendChild(option);
  }
}

/* =========================================================
   RENDER SHOPS
   ========================================================= */

function renderShops(shouldScroll = false) {
  if (!shopsGrid) return;

  const search = activeSearch.toLowerCase().trim();

  let filtered = allShops.filter((shop) => {
    const shopCategories = getShopCategories(shop);

    const searchableText = `
      ${shop.shopName || ""}
      ${shop.description || ""}
      ${shop.location || ""}
      ${shop.address || ""}
      ${shop.slug || ""}
      ${shopCategories.join(" ")}
    `.toLowerCase();

    const matchesSearch = !search || searchableText.includes(search);
    const matchesCategory =
      !activeCategory || shopCategories.includes(activeCategory);

    return matchesSearch && matchesCategory;
  });

  filtered = sortShops(filtered, activeSort);

  shopsGrid.innerHTML = "";

  if (!filtered.length) {
    shopsEmptyState.style.display = "block";
    shopsGrid.style.display = "none";
  } else {
    shopsEmptyState.style.display = "none";
    shopsGrid.style.display = "grid";

    filtered.forEach((shop) => {
      shopsGrid.appendChild(createShopCard(shop));
    });
  }

  updateResultsText(filtered.length);
  updateUrlState();
  renderCategoryControls();

  if (shouldScroll) {
    document.querySelector(".shops-directory-main")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function createShopCard(shop) {
  const card = document.createElement("article");

  card.className = "directory-shop-card";

  const shopName = shop.shopName || "MauMarket Shop";
  const location = safeArea(shop.location || shop.address || "Mauritius");
  const rating = Number(shop.averageRating || 0);
  const totalReviews = Number(shop.totalReviews || 0);
  const listingCount = Number(shop.listingCount || 0);

  const ratingText = rating > 0
    ? `${rating.toFixed(1)} (${totalReviews})`
    : "New shop";

  const bannerImage =
    shop.bannerUrl ||
    shop.coverUrl ||
    shop.productImages?.[0] ||
    "";

  const logoMarkup = shop.logoUrl
    ? `
        <img
          class="directory-shop-logo-img"
          src="${escapeHtml(shop.logoUrl)}"
          alt="${escapeHtml(shopName)}">
      `
    : `
        <div class="directory-shop-logo-fallback">
          ${escapeHtml(getShopInitials(shopName))}
        </div>
      `;

  const bannerMarkup = bannerImage
    ? `
        <img
          class="directory-shop-banner-img"
          src="${escapeHtml(bannerImage)}"
          alt="${escapeHtml(shopName)} banner">
      `
    : `
        <div class="directory-shop-banner-fallback">
          ${escapeHtml(getShopInitials(shopName))}
        </div>
      `;

  const primaryCategory = getShopCategories(shop)[0] || "General";
  const publicShopUrl = buildShopUrl(shop);

  card.innerHTML = `
    <a
      class="directory-shop-card-link"
      href="${escapeHtml(publicShopUrl)}"
      aria-label="Visit ${escapeHtml(shopName)}">

      <div class="directory-shop-banner">
        ${bannerMarkup}

        <div class="directory-shop-banner-overlay"></div>

        <span class="directory-shop-badge">
          ${shop.featuredShop === true ? "⭐ Featured" : "✓ Verified"}
        </span>
      </div>

      <div class="directory-shop-body">

        <div class="directory-shop-logo-wrap">
          ${logoMarkup}
        </div>

        <div class="directory-shop-title-row">
          <div>
            <h3>${escapeHtml(shopName)}</h3>
            <p>${escapeHtml(location)}</p>
          </div>

          <span class="directory-shop-check" title="Verified seller">
            ✓
          </span>
        </div>

        <p class="directory-shop-description">
          ${escapeHtml(
            shop.description ||
            "Discover products and services from this verified MauMarket seller."
          )}
        </p>

        <div class="directory-shop-tags">
          <span>${escapeHtml(primaryCategory)}</span>
          <span>${listingCount} ${listingCount === 1 ? "listing" : "listings"}</span>
          <span>${escapeHtml(ratingText)}</span>
        </div>

        <div class="directory-shop-stats">
          <div>
            <strong>${Number(shop.productCount || 0)}</strong>
            <span>Products</span>
          </div>

          <div>
            <strong>${Number(shop.serviceCount || 0)}</strong>
            <span>Services</span>
          </div>

          <div>
            <strong>${rating > 0 ? rating.toFixed(1) : "New"}</strong>
            <span>Rating</span>
          </div>
        </div>

        <div class="directory-shop-footer">
          <span>MauMarket Verified</span>
          <strong>Visit Shop →</strong>
        </div>

      </div>
    </a>
  `;

  return card;
}

function sortShops(shops, sort) {
  const copy = [...shops];

  if (sort === "rating") {
    copy.sort((a, b) => {
      const aScore =
        Number(a.averageRating || 0) * 100 +
        Number(a.totalReviews || 0);

      const bScore =
        Number(b.averageRating || 0) * 100 +
        Number(b.totalReviews || 0);

      return bScore - aScore;
    });
  }

  if (sort === "listings") {
    copy.sort(
      (a, b) =>
        Number(b.listingCount || 0) - Number(a.listingCount || 0)
    );
  }

  if (sort === "newest") {
    copy.sort((a, b) => {
      const aTime =
        Number(a.createdAt?.seconds || 0) ||
        Number(a.latestListingTime || 0);

      const bTime =
        Number(b.createdAt?.seconds || 0) ||
        Number(b.latestListingTime || 0);

      return bTime - aTime;
    });
  }

  if (sort === "alphabetical") {
    copy.sort((a, b) =>
      String(a.shopName || "").localeCompare(String(b.shopName || ""))
    );
  }

  if (sort === "featured") {
    copy.sort((a, b) => {
      const aScore =
        Number(a.featuredShop === true) * 5000 +
        Number(a.averageRating || 0) * 100 +
        Number(a.totalReviews || 0) * 3 +
        Number(a.listingCount || 0);

      const bScore =
        Number(b.featured === true) * 1000 +
        Number(b.averageRating || 0) * 100 +
        Number(b.totalReviews || 0) * 3 +
        Number(b.listingCount || 0);

      return bScore - aScore;
    });
  }

  return copy;
}

/* =========================================================
   STATE / EVENTS
   ========================================================= */

function attachEvents() {
  shopsSearchInput?.addEventListener("input", () => {
    activeSearch = shopsSearchInput.value.trim();
    renderShops(false);
  });

  shopsSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      activeSearch = shopsSearchInput.value.trim();
      renderShops(true);
    }
  });

  shopsSearchBtn?.addEventListener("click", () => {
    activeSearch = shopsSearchInput?.value.trim() || "";
    renderShops(true);
  });

  shopsCategoryFilter?.addEventListener("change", () => {
    setCategory(shopsCategoryFilter.value);
    renderShops(true);
  });

  shopsSortFilter?.addEventListener("change", () => {
    activeSort = shopsSortFilter.value || "featured";
    renderShops(false);
  });

  clearShopFiltersBtn?.addEventListener("click", clearFilters);
  shopsEmptyClearBtn?.addEventListener("click", clearFilters);
}

function setCategory(value) {
  activeCategory = value || "";

  if (shopsCategoryFilter) {
    ensureCategoryOption(activeCategory);
    shopsCategoryFilter.value = activeCategory;
  }
}

function clearFilters() {
  activeSearch = "";
  activeCategory = "";
  activeSort = "featured";

  if (shopsSearchInput) shopsSearchInput.value = "";
  if (shopsCategoryFilter) shopsCategoryFilter.value = "";
  if (shopsSortFilter) shopsSortFilter.value = "featured";

  renderShops(true);
}

function updateUrlState() {
  const nextParams = new URLSearchParams();

  if (activeSearch) nextParams.set("search", activeSearch);
  if (activeCategory) nextParams.set("category", activeCategory);
  if (activeSort && activeSort !== "featured") {
    nextParams.set("sort", activeSort);
  }

  const nextUrl = nextParams.toString()
    ? `${window.location.pathname}?${nextParams.toString()}`
    : window.location.pathname;

  window.history.replaceState({}, "", nextUrl);
}

/* =========================================================
   DISPLAY HELPERS
   ========================================================= */

function showLoadingState() {
  if (shopsGrid) {
    shopsGrid.style.display = "grid";

    shopsGrid.innerHTML = Array.from({ length: 8 })
      .map(() => `
        <div class="directory-shop-card shops-directory-skeleton">
          <div class="directory-shop-banner skeleton-box"></div>

          <div class="directory-shop-body">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line medium"></div>
          </div>
        </div>
      `)
      .join("");
  }

  if (shopsEmptyState) {
    shopsEmptyState.style.display = "none";
  }
}

function updateHeroStats() {
  const totalListings = allShops.reduce(
    (sum, shop) => sum + Number(shop.listingCount || 0),
    0
  );

  if (featuredShopsCount) {
    featuredShopsCount.textContent = String(featuredShops.length);
  }

  if (shopsTotalCount) {
    shopsTotalCount.textContent = String(allShops.length);
  }

  if (shopsListingsCount) {
    shopsListingsCount.textContent = String(totalListings);
  }
}

function updateResultsText(count) {
  if (shopsResultCount) {
    const categoryText = activeCategory
      ? ` in ${activeCategory}`
      : "";

    shopsResultCount.textContent =
      `${count} verified shop${count === 1 ? "" : "s"} found${categoryText}.`;
  }

  if (shopsDirectoryTitle) {
    if (activeSearch) {
      shopsDirectoryTitle.textContent =
        `Search results for "${activeSearch}"`;
    } else if (activeCategory) {
      shopsDirectoryTitle.textContent = `${activeCategory} Shops`;
    } else {
      shopsDirectoryTitle.textContent = "All Shops";
    }
  }
}

function normalizeShopSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[\'’]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildShopUrl(shop) {
  const slug = normalizeShopSlug(
    shop?.slug ||
    shop?.shopSlug ||
    ""
  );

  if (slug) {
    return `shop.html?shop=${encodeURIComponent(slug)}`;
  }

  const sellerId =
    shop?.ownerId ||
    shop?.sellerId ||
    shop?.id ||
    "";

  if (sellerId) {
    return `shop.html?id=${encodeURIComponent(sellerId)}`;
  }

  return "shops.html";
}

function getShopCategories(shop) {
  if (Array.isArray(shop.categories) && shop.categories.length) {
    return shop.categories.filter(Boolean);
  }

  if (shop.category) {
    return [shop.category];
  }

  return [];
}

function getShopInitials(name) {
  const words = String(name || "M")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  const initials = words
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return initials || "M";
}

function safeArea(location) {
  const raw = String(location || "Mauritius").trim();

  if (!raw) return "Mauritius";

  return raw
    .replace(/\d+/g, "")
    .replace(
      /street|road|avenue|lane|house|building|flat|apartment/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim() || "Mauritius";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   FEATURED SHOP HELPERS
   ========================================================= */



function timestampToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isFeaturedShop(shop) {
  return (
    shop.featuredShop === true &&
    shop.featuredStatus === "active" &&
    shop.featuredPaymentVerified === true &&
    shop.showInExploreShops === true
  );
}
