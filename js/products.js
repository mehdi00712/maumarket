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

/*
  MauMarket products.js
  Updated for:
  - Shared nav.js header
  - Cleaner marketplace UI
  - Safer null checks
  - Category icons
  - Featured shops
  - Premium ad banner
  - Search/category/sort filters
  - Buyer-facing price only
  - No commission wording shown to buyers
*/

const COMMISSION_RATE = 0.10;

const productsGrid = document.getElementById("productsGrid");
const resultCount = document.getElementById("resultCount");
const categoryIconGrid = document.getElementById("categoryIconGrid");
const featuredShops = document.getElementById("featuredShops");
const featuredShopsSection = document.getElementById("featuredShopsSection");
const topAdBanner = document.getElementById("topAdBanner");

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

let allItems = [];
let allCategories = [];
let shopCache = {};

let activeSearch = "";
let activeCategory = "";
let activeSort = "newest";

const params = new URLSearchParams(window.location.search);
activeSearch = params.get("search") || "";
activeCategory = params.get("category") || "";

if (searchInput) searchInput.value = activeSearch;
if (searchInput2) searchInput2.value = activeSearch;

attachSearchEvents();
attachFilterEvents();


/* =========================================================
   SHARED NAV SEARCH BRIDGE
   nav.js dispatches "maumarket:search" on products.html.
   This listener applies the search and scrolls to results.
   ========================================================= */
window.addEventListener("maumarket:search", (event) => {
  const detail = event?.detail || {};
  const nextSearch = String(detail.search || "").trim();
  const nextCategory = String(detail.category || "").trim();
  const shouldScroll = detail.scroll === true;

  setSearch(nextSearch);
  setCategory(nextCategory);
  updateUrlState();
  renderCategoryIcons();
  renderItems(shouldScroll);
});

await loadCategories();
await loadTopBanner();
await loadItems();

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

    if (allCategories.length === 0) {
      renderFallbackCategories();
      return;
    }

    allCategories.sort((a, b) => {
      const aOrder = Number(a.sortOrder || 0);
      const bOrder = Number(b.sortOrder || 0);

      if (aOrder !== bOrder) return aOrder - bOrder;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    renderCategoryDropdowns();
    renderCategoryIcons();
  } catch (error) {
    console.warn("Categories could not load:", error.message);
    renderFallbackCategories();
  }
}

function renderFallbackCategories() {
  allCategories = [
    { name: "Beauty", icon: "beauty", sortOrder: 1 },
    { name: "Electronics", icon: "electronics", sortOrder: 2 },
    { name: "Phones", icon: "phone", sortOrder: 3 },
    { name: "Fashion", icon: "fashion", sortOrder: 4 },
    { name: "Food", icon: "food", sortOrder: 5 },
    { name: "Hardware", icon: "hardware", sortOrder: 6 },
    { name: "Home", icon: "home", sortOrder: 7 },
    { name: "Services", icon: "services", sortOrder: 8 },
    { name: "Vehicles", icon: "vehicles", sortOrder: 9 },
    { name: "Other", icon: "other", sortOrder: 10 }
  ];

  renderCategoryDropdowns();
  renderCategoryIcons();
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
      option.textContent = category.name || "Category";

      select.appendChild(option);
    });

    select.value = activeCategory;
  });
}

function renderCategoryIcons() {
  if (!categoryIconGrid) return;

  const categories = [
    {
      name: "",
      icon: "grid",
      label: "All"
    },
    ...allCategories.map((category) => ({
      name: category.name || "",
      icon: normalizeIcon(category.icon || category.name),
      label: category.name || "Category"
    }))
  ];

  categoryIconGrid.innerHTML = "";

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-icon-card ${activeCategory === category.name ? "active" : ""}`;

    button.innerHTML = `
      <span class="category-icon-circle">
        ${svgIcon(category.icon)}
      </span>
      <span>${escapeHtml(category.label)}</span>
    `;

    button.addEventListener("click", () => {
      setCategory(category.name);
      runSearch(true);
    });

    categoryIconGrid.appendChild(button);
  });
}

function getBannerShopUrl(banner) {
  if (!banner) return "shops.html";

  // Prefer a direct URL saved by the admin, if one exists.
  const directUrl = String(
    banner.shopUrl ||
    banner.targetUrl ||
    banner.linkUrl ||
    banner.url ||
    ""
  ).trim();

  if (directUrl) return directUrl;

  // Prefer the exact shop/seller ID. MauMarket shops normally use
  // the seller UID as the shop document ID.
  const shopId = String(
    banner.shopId ||
    banner.sellerId ||
    banner.ownerId ||
    banner.featuredShopId ||
    banner.targetShopId ||
    banner.uid ||
    ""
  ).trim();

  if (shopId) {
    return `shop.html?id=${encodeURIComponent(shopId)}`;
  }

  // If the banner stores a shop slug, use it.
  const storedSlug = String(
    banner.shopSlug ||
    banner.slug ||
    ""
  ).trim();

  if (storedSlug) {
    return `shop.html?shop=${encodeURIComponent(storedSlug)}`;
  }

  // Last fallback: use the banner's shop name as the public shop slug.
  // This keeps older banners working when they were saved before shopId
  // was added to the banner document.
  const shopName = String(banner.shopName || "").trim();

  if (shopName) {
    const generatedSlug = normalizeShopSlug(shopName);

    if (generatedSlug) {
      return `shop.html?shop=${encodeURIComponent(generatedSlug)}`;
    }
  }

  // Only fall back to the Featured Shops directory when the banner
  // contains no shop reference at all.
  return "shops.html";
}

async function loadTopBanner() {
  if (!topAdBanner) return;

  try {
    const bannerQuery = query(
      collection(db, "banners"),
      where("active", "==", true)
    );

    const snapshot = await getDocs(bannerQuery);

    if (snapshot.empty) {
      topAdBanner.style.display = "none";
      return;
    }

    const banners = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .filter((banner) => banner.imageUrl)
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;

        return bTime - aTime;
      });

    if (banners.length === 0) {
      topAdBanner.style.display = "none";
      return;
    }

    topAdBanner.style.display = "block";
    topAdBanner.classList.add("featured-banner-slider");

    let currentBannerIndex = 0;
    let autoSlideTimer = null;

    function renderBanner(index) {
      const banner = banners[index];

      topAdBanner.innerHTML = `
        <div class="featured-banner-slide">

          <img
            class="featured-banner-image"
            src="${escapeHtml(banner.imageUrl)}"
            alt="${escapeHtml(
              banner.title ||
              banner.shopName ||
              "Featured Shop"
            )}">

          <div class="featured-banner-overlay"></div>

          <div class="featured-banner-content">

            <span class="featured-banner-badge">
              ★ Featured Shop
            </span>

            <h2>
              ${escapeHtml(
                banner.title ||
                banner.shopName ||
                "Featured Shop"
              )}
            </h2>

            <p>
              ${escapeHtml(
                banner.subtitle ||
                "Discover this featured MauMarket seller."
              )}
            </p>

            <a
              href="${getBannerShopUrl(banner)}"
              class="featured-banner-button">
              Explore Featured Shop
            </a>

          </div>

          ${
            banners.length > 1
              ? `
                <button
                  type="button"
                  class="featured-banner-arrow previous"
                  aria-label="Previous featured shop">
                  ‹
                </button>

                <button
                  type="button"
                  class="featured-banner-arrow next"
                  aria-label="Next featured shop">
                  ›
                </button>

                <div class="featured-banner-dots">
                  ${banners
                    .map(
                      (_, dotIndex) => `
                        <button
                          type="button"
                          class="featured-banner-dot ${
                            dotIndex === index ? "active" : ""
                          }"
                          data-banner-index="${dotIndex}"
                          aria-label="Show featured shop ${
                            dotIndex + 1
                          }">
                        </button>
                      `
                    )
                    .join("")}
                </div>
              `
              : ""
          }

        </div>
      `;

      topAdBanner
        .querySelector(".featured-banner-button")
        ?.addEventListener("click", async () => {
          try {
            await updateDoc(doc(db, "banners", banner.id), {
              clicks: increment(1)
            });
          } catch (error) {
            console.warn(
              "Could not update banner clicks:",
              error.message
            );
          }
        });

      topAdBanner
        .querySelector(".featured-banner-arrow.previous")
        ?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          currentBannerIndex =
            currentBannerIndex === 0
              ? banners.length - 1
              : currentBannerIndex - 1;

          renderBanner(currentBannerIndex);
          restartAutoSlide();
        });

      topAdBanner
        .querySelector(".featured-banner-arrow.next")
        ?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          currentBannerIndex =
            (currentBannerIndex + 1) % banners.length;

          renderBanner(currentBannerIndex);
          restartAutoSlide();
        });

      topAdBanner
        .querySelectorAll(".featured-banner-dot")
        .forEach((dot) => {
          dot.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            currentBannerIndex = Number(
              dot.dataset.bannerIndex || 0
            );

            renderBanner(currentBannerIndex);
            restartAutoSlide();
          });
        });
    }

    function startAutoSlide() {
      if (banners.length <= 1) return;

      autoSlideTimer = window.setInterval(() => {
        currentBannerIndex =
          (currentBannerIndex + 1) % banners.length;

        renderBanner(currentBannerIndex);
      }, 5500);
    }

    function restartAutoSlide() {
      if (autoSlideTimer) {
        window.clearInterval(autoSlideTimer);
      }

      startAutoSlide();
    }

    renderBanner(currentBannerIndex);
    startAutoSlide();

    topAdBanner.addEventListener("mouseenter", () => {
      if (autoSlideTimer) {
        window.clearInterval(autoSlideTimer);
      }
    });

    topAdBanner.addEventListener("mouseleave", () => {
      restartAutoSlide();
    });

  } catch (error) {
    console.warn("Banner could not load:", error.message);
    topAdBanner.style.display = "none";
  }
}

async function loadItems() {
  if (!productsGrid) return;

  renderSkeletonGrid();

  try {
    const productsQuery = query(
      collection(db, "products"),
      where("active", "==", true)
    );

    const snapshot = await getDocs(productsQuery);

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
      <div class="order-card empty-market-card">
        <h3>Marketplace could not load</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderSkeletonGrid() {
  if (!productsGrid) return;

  productsGrid.innerHTML = Array.from({ length: 10 }).map(() => `
    <div class="market-product-card skeleton-card">
      <div class="market-product-img skeleton-box"></div>
      <div class="market-product-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join("");
}

async function getShop(sellerId) {
  if (!sellerId) return emptyShop("");

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
      shopCache[sellerId] = emptyShop(sellerId);
    }
  } catch (error) {
    console.warn("Could not load shop:", error.message);
    shopCache[sellerId] = emptyShop(sellerId);
  }

  return shopCache[sellerId];
}

function emptyShop(id) {
  return {
    id,
    shopName: "MauMarket Seller",
    verified: false,
    averageRating: 0,
    totalReviews: 0,
    location: "Mauritius"
  };
}


function timestampToDate(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;

  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPaidFeaturedShop(shop) {
  if (!shop) return false;

  const expiry = timestampToDate(shop.featuredExpiry);

  return (
    shop.active !== false &&
    shop.approved !== false &&
    shop.featuredShop === true &&
    String(shop.featuredStatus || "").toLowerCase() === "active" &&
    shop.featuredPaymentVerified === true &&
    shop.showInExploreShops === true &&
    expiry instanceof Date &&
    !Number.isNaN(expiry.getTime()) &&
    expiry.getTime() > Date.now()
  );
}

function normalizeShopSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function getPublicShopUrl(shop, fallbackSellerId = "") {
  if (!isPaidFeaturedShop(shop)) return "";

  const slug = normalizeShopSlug(
    shop.slug ||
    shop.shopSlug ||
    shop.shopName ||
    ""
  );

  if (slug) {
    return `shop.html?shop=${encodeURIComponent(slug)}`;
  }

  const id = shop.id || fallbackSellerId;

  return id
    ? `shop.html?id=${encodeURIComponent(id)}`
    : "";
}

function renderFeaturedShops() {
  if (!featuredShops || !featuredShopsSection) return;

  const uniqueShops = {};

  allItems.forEach((item) => {
    if (
      item.sellerId &&
      item.shop &&
      isPaidFeaturedShop(item.shop)
    ) {
      uniqueShops[item.sellerId] = {
        id: item.sellerId,
        ...item.shop
      };
    }
  });

  const shops = Object.values(uniqueShops)
    .sort((a, b) => {
      const aSince = timestampToDate(a.featuredSince)?.getTime() || 0;
      const bSince = timestampToDate(b.featuredSince)?.getTime() || 0;

      if (aSince !== bSince) return bSince - aSince;

      const aScore =
        Number(a.averageRating || 0) +
        Number(a.totalReviews || 0) * 0.05;

      const bScore =
        Number(b.averageRating || 0) +
        Number(b.totalReviews || 0) * 0.05;

      return bScore - aScore;
    })
    .slice(0, 12);

  if (shops.length === 0) {
    featuredShopsSection.style.display = "none";
    featuredShops.innerHTML = "";
    return;
  }

  featuredShopsSection.style.display = "";
  featuredShops.innerHTML = "";

  shops.forEach((shop) => {
    const publicUrl = getPublicShopUrl(shop, shop.id);
    if (!publicUrl) return;

    const rating = Number(shop.averageRating || 0);
    const totalReviews = Number(shop.totalReviews || 0);

    const card = document.createElement("a");
    card.className = "featured-shop-card featured-shop-wow";
    card.href = publicUrl;

    card.innerHTML = `
      <strong>${escapeHtml(shop.shopName || "Featured Shop")}</strong>
      <span>✓ Verified MauMarket seller</span>
      <small>
        ${
          rating > 0
            ? `⭐ ${rating.toFixed(1)} (${totalReviews})`
            : "New featured shop"
        }
      </small>
      <span class="featured-shop-cta">Visit Featured Shop →</span>
    `;

    featuredShops.appendChild(card);
  });
}

function renderItems(shouldScroll = false) {
  if (!productsGrid) return;

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
      ${isPaidFeaturedShop(item.shop) ? (item.shop?.shopName || "") : ""}
      ${getBuyerPrice(item)}
      ${item.serviceArea || ""}
      ${item.shop?.location || ""}
    `.toLowerCase();

    const matchesSearch = !search || searchableText.includes(search);
    const matchesType = !type || item.type === type;
    const matchesCategory = !category || item.category === category;

    return matchesSearch && matchesType && matchesCategory;
  });

  filtered = sortItems(filtered, sort);

  if (resultCount) {
    const categoryText = activeCategory ? ` in ${activeCategory}` : "";

    resultCount.textContent = search
      ? `${filtered.length} result(s) for "${escapeHtml(search)}"${categoryText}`
      : `${filtered.length} result(s) found${categoryText}`;
  }

  if (filtered.length === 0) {
    renderEmptyState(search);
    if (shouldScroll) scrollToProducts();
    return;
  }

  productsGrid.innerHTML = "";

  filtered.forEach((item) => {
    productsGrid.appendChild(createProductCard(item));
  });

  if (shouldScroll) scrollToProducts();
}

function renderEmptyState(search) {
  productsGrid.innerHTML = `
    <div class="order-card empty-market-card">
      <h3>No items found</h3>
      <p>${search ? `No result for "${escapeHtml(search)}".` : "Try another search, category, or filter."}</p>
      <button type="button" id="clearMarketplaceSearch" class="secondary-btn">
        Clear Search
      </button>
    </div>
  `;

  document.getElementById("clearMarketplaceSearch")?.addEventListener("click", () => {
    setSearch("");
    setCategory("");
    setSort("newest");
    runSearch(true);
  });
}

function sortItems(items, sort) {
  const copy = [...items];

  if (sort === "low-high") {
    copy.sort((a, b) => getBuyerPrice(a) - getBuyerPrice(b));
  }

  if (sort === "high-low") {
    copy.sort((a, b) => getBuyerPrice(b) - getBuyerPrice(a));
  }

  if (sort === "newest") {
    copy.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  }

  if (sort === "rating") {
    copy.sort((a, b) => {
      const aRating = Number(a.averageRating || a.shop?.averageRating || 0);
      const bRating = Number(b.averageRating || b.shop?.averageRating || 0);

      return bRating - aRating;
    });
  }

  return copy;
}

function createProductCard(item) {
  const productRating = Number(item.averageRating || 0);
  const productReviews = Number(item.totalReviews || 0);
  const shopRating = Number(item.shop?.averageRating || 0);
  const shopReviews = Number(item.shop?.totalReviews || 0);
  const sold = Number(item.soldCount || 0);

  const buyerPrice = getBuyerPrice(item);
  const location = safeArea(
    item.shop?.location ||
    item.serviceArea ||
    "Mauritius"
  );

  const publicShopUrl = getPublicShopUrl(item.shop, item.sellerId);
  const paidFeatured = Boolean(publicShopUrl);

  const ratingText = productRating > 0
    ? `⭐ ${productRating.toFixed(1)} (${productReviews})`
    : "⭐ New item";

  const sellerRatingText = shopRating > 0
    ? `Seller ⭐ ${shopRating.toFixed(1)} (${shopReviews})`
    : "Verified seller";

  const sellerLine = paidFeatured
    ? `
        <a
          class="paid-shop-link"
          href="${publicShopUrl}">
          ${escapeHtml(item.shop?.shopName || "Featured Shop")}
          <span class="featured-product-shop-badge">★ FEATURED</span>
        </a>
      `
    : `<span>✓ Verified MauMarket Seller</span>`;

  const card = document.createElement("article");
  card.className = "market-product-card market-wow-product-card";

  card.innerHTML = `
    <a
      class="market-product-img"
      href="product-details.html?id=${encodeURIComponent(item.id)}">

      ${
        item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Product")}">`
          : `<div class="no-img">No Image</div>`
      }

      ${getDiscountBadge(item)}
      ${getStockBadge(item)}
    </a>

    <div class="market-product-body">

      <div class="product-card-top-row">
        <span class="badge">${escapeHtml(item.type || "item")}</span>
        <button class="product-heart" type="button" aria-label="View product">♡</button>
      </div>

      <h3>${escapeHtml(item.title || "Untitled")}</h3>

      <p class="seller-line">${sellerLine}</p>

      <p class="rating-line-small">${ratingText}</p>

      <p class="rating-line-small muted">
        ${sellerRatingText}${sold > 0 ? ` • ${sold} sold` : ""}
      </p>


      <p class="price">${formatRs(buyerPrice)}</p>

      <a
        class="btn product-main-btn"
        href="product-details.html?id=${encodeURIComponent(item.id)}">
        View Product
      </a>

    </div>
  `;

  card.querySelector(".product-heart")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    window.location.href =
      `product-details.html?id=${encodeURIComponent(item.id)}`;
  });

  return card;
}

function getDiscountBadge(item) {
  const oldPrice = Number(item.oldPrice || item.compareAtPrice || 0);
  const price = getBuyerPrice(item);

  if (!oldPrice || !price || oldPrice <= price) return "";

  const discount = Math.round(((oldPrice - price) / oldPrice) * 100);

  if (discount <= 0) return "";

  return `<span class="product-discount-badge">-${discount}%</span>`;
}

function getStockBadge(item) {
  if (item.type === "service") return "";

  const stock = Number(item.stock || 0);

  if (stock <= 0) {
    return `<span class="product-stock-badge danger">Out of stock</span>`;
  }

  if (stock <= 5) {
    return `<span class="product-stock-badge">Only ${stock} left</span>`;
  }

  return "";
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
  const focused = document.activeElement;

  if (focused === searchInput2) return (searchInput2?.value || "").trim();
  if (focused === searchInput) return (searchInput?.value || "").trim();

  return (searchInput2?.value || searchInput?.value || activeSearch || "").trim();
}

function getCategoryValue() {
  const focused = document.activeElement;

  if (focused === categoryFilter) return categoryFilter?.value || "";
  if (focused === sideCategoryFilter) return sideCategoryFilter?.value || "";
  if (focused === topCategoryFilter) return topCategoryFilter?.value || "";

  return (
    categoryFilter?.value ||
    sideCategoryFilter?.value ||
    topCategoryFilter?.value ||
    activeCategory ||
    ""
  );
}

function getSortValue() {
  const focused = document.activeElement;

  if (focused === sortFilter) return sortFilter?.value || "newest";
  if (focused === sideSortFilter) return sideSortFilter?.value || "newest";

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
  if (!target) return;

  const sharedNav = document.getElementById("mmSharedNav");
  const mobileSearch = document.getElementById("mmMobileSearch");

  const navHeight = sharedNav?.getBoundingClientRect().height || 0;
  const mobileSearchHeight =
    window.innerWidth <= 980
      ? (mobileSearch?.getBoundingClientRect().height || 0)
      : 0;

  const extraGap = 18;
  const top =
    target.getBoundingClientRect().top +
    window.scrollY -
    navHeight -
    mobileSearchHeight -
    extraGap;

  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth"
  });
}

function attachSearchEvents() {
  searchInput?.addEventListener("input", () => {
    setSearch(searchInput.value);
    updateUrlState();
    renderItems(false);
  });

  searchInput2?.addEventListener("input", () => {
    setSearch(searchInput2.value);
    updateUrlState();
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

function getBuyerPrice(item) {
  const buyerPrice = Number(item.buyerPrice || 0);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice);
  }

  const price = Number(item.price || 0);

  if (price > 0) {
    return roundMoney(price);
  }

  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice * (1 + COMMISSION_RATE));
  }

  return 0;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatRs(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function safeArea(location) {
  const raw = String(location || "Mauritius").trim();

  if (!raw) return "Mauritius Area";

  const cleaned = raw
    .replace(/\d+/g, "")
    .replace(/street|road|avenue|lane|house|building|flat|apartment/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Mauritius Area";

  return cleaned.toLowerCase().includes("area") ? cleaned : `${cleaned} Area`;
}

function normalizeIcon(icon) {
  const value = String(icon || "other").toLowerCase().trim();

  if (value.includes("elect")) return "electronics";
  if (value.includes("phone")) return "phone";
  if (value.includes("laptop") || value.includes("computer")) return "laptop";
  if (value.includes("fashion") || value.includes("clothes")) return "fashion";
  if (value.includes("beauty")) return "beauty";
  if (value.includes("food")) return "food";
  if (value.includes("grocery")) return "grocery";
  if (value.includes("home")) return "home";
  if (value.includes("furniture")) return "furniture";
  if (value.includes("hardware")) return "hardware";
  if (value.includes("tool")) return "tools";
  if (value.includes("service")) return "services";
  if (value.includes("vehicle") || value.includes("car")) return "vehicles";
  if (value.includes("baby") || value.includes("kid")) return "baby";
  if (value.includes("sport")) return "sports";
  if (value.includes("book")) return "books";
  if (value.includes("pet")) return "pets";
  if (value.includes("health")) return "health";
  if (value.includes("gift")) return "gift";

  return value || "other";
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
    electronics: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="13" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M8 19h6M11 15v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <rect x="18" y="8" width="3" height="8" rx="1" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    phone: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="8" y="2.5" width="8" height="19" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M11 18h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    laptop: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="4" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M3 19h18l-2-5H5l-2 5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `,
    fashion: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M9 4 6 6l-3 5 4 2 2-3v10h10V10l2 3 4-2-3-5-3-2-3 3h-4L9 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `,
    beauty: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M8 21h8M9 21V9a3 3 0 0 1 6 0v12M7 11h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 5c2-3 4-3 6 0 2-3 4-3 6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    food: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M4 13h16a8 8 0 0 0-16 0Z" stroke="currentColor" stroke-width="2"/>
        <path d="M3 16h18M6 19h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 9h.01M13 7h.01M16 10h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `,
    grocery: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M6 7h15l-2 8H8L6 7ZM6 7 5 3H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="9" cy="20" r="1.5" stroke="currentColor" stroke-width="2"/>
        <circle cx="18" cy="20" r="1.5" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    home: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M3 11 12 4l9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M5 10v10h14V10" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M10 20v-6h4v6" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    furniture: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4" stroke="currentColor" stroke-width="2"/>
        <path d="M4 11h16v8H4v-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M7 19v2M17 19v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    hardware: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="m14 7 3-3 3 3-3 3M4 20l8-8M12 12l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="m5 5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    tools: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M14 6a4 4 0 0 0 5 5L11 19a3 3 0 0 1-4-4l8-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
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
    baby: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7" r="3" stroke="currentColor" stroke-width="2"/>
        <path d="M6 21a6 6 0 0 1 12 0M9 13l-3 3M15 13l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    sports: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
        <path d="M5 9c4 1 9 1 14 0M5 15c4-1 9-1 14 0M12 3c2 5 2 13 0 18" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    books: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3-3V4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M8 8h7M8 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    pets: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="7" cy="8" r="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="8" r="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="9" cy="15" r="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="15" cy="15" r="2" stroke="currentColor" stroke-width="2"/>
        <path d="M12 12c2 0 4 3 4 5s-2 3-4 3-4-1-4-3 2-5 4-5Z" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    health: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11Z" stroke="currentColor" stroke-width="2"/>
        <path d="M12 8v6M9 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    gift: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M4 10h16v10H4V10Z" stroke="currentColor" stroke-width="2"/>
        <path d="M3 7h18v3H3V7ZM12 7v13" stroke="currentColor" stroke-width="2"/>
        <path d="M12 7C8 7 7 3 9 3s3 4 3 4Zm0 0c4 0 5-4 3-4s-3 4-3 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
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
