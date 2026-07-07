import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  MauMarket products.js
  Clean marketplace version
  - Smaller product cards
  - No messy emojis in headings
  - Buyer-facing price only
  - Categories
  - Featured shops
  - Top deals
  - Trending
  - Main marketplace filters
*/

const COMMISSION_RATE = 0.10;

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  /*
    Old versions of the marketplace used localStorage for cart animation.
    MauMarket now uses Firestore only, so this clears the old fake cart count.
  */
  localStorage.removeItem("cart");

  window.dispatchEvent(new CustomEvent("cart-updated"));
});

const productsGrid = document.getElementById("productsGrid");
const productsGridTrending = document.getElementById("productsGridTrending");
const productsGridDeals = document.getElementById("productsGridDeals");
const resultCount = document.getElementById("resultCount");
const marketTitle = document.getElementById("marketTitle");
const clearSearchTop = document.getElementById("clearSearchTop");

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
attachSharedNavSearch();
attachInstantSearchEvent();

await loadCategories();
await loadTopBanner();
await loadItems();

/* =========================================================
   LOAD CATEGORIES
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
    { name: "Electronics", icon: "electronics", sortOrder: 1 },
    { name: "Fashion", icon: "fashion", sortOrder: 2 },
    { name: "Home", icon: "home", sortOrder: 3 },
    { name: "Beauty", icon: "beauty", sortOrder: 4 },
    { name: "Food", icon: "food", sortOrder: 5 },
    { name: "Hardware", icon: "hardware", sortOrder: 6 },
    { name: "Services", icon: "services", sortOrder: 7 },
    { name: "Other", icon: "other", sortOrder: 8 }
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

/* =========================================================
   LOAD BANNER
   ========================================================= */

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

    const banners = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    banners.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    const banner = banners[0];

    if (!banner.imageUrl) {
      topAdBanner.style.display = "none";
      return;
    }

    const targetShopId = banner.shopId || banner.sellerId || "";

    topAdBanner.style.display = "block";

    topAdBanner.innerHTML = `
      <div class="top-ad-inner premium-ad-inner">
        <img src="${escapeHtml(banner.imageUrl)}" alt="${escapeHtml(banner.title || "Featured shop")}">

        <div class="top-ad-content premium-ad-content">
          <span>Featured Shop</span>
          <h2>${escapeHtml(banner.title || banner.shopName || "Featured Seller")}</h2>
          <p>${escapeHtml(banner.subtitle || "Discover this MauMarket seller.")}</p>
          <button type="button">Visit Shop</button>
        </div>
      </div>
    `;

    topAdBanner.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "banners", banner.id), {
          clicks: increment(1)
        });
      } catch (error) {
        console.warn("Could not update banner clicks:", error.message);
      }

      if (targetShopId) {
        window.location.href = `shop.html?id=${encodeURIComponent(targetShopId)}`;
      } else {
        window.location.href = "products.html";
      }
    });
  } catch (error) {
    console.warn("Banner could not load:", error.message);
    topAdBanner.style.display = "none";
  }
}

/* =========================================================
   LOAD PRODUCTS
   ========================================================= */

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
      <div class="empty-market-card">
        <h3>Marketplace could not load</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderSkeletonGrid() {
  const skeletonHtml = Array.from({ length: 8 }).map(() => `
    <div class="market-product-card skeleton-card">
      <div class="market-product-img skeleton-box"></div>

      <div class="market-product-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line medium"></div>
      </div>
    </div>
  `).join("");

  if (productsGrid) productsGrid.innerHTML = skeletonHtml;
  if (productsGridTrending) productsGridTrending.innerHTML = skeletonHtml;
  if (productsGridDeals) productsGridDeals.innerHTML = skeletonHtml;
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

/* =========================================================
   HOME SECTIONS
   ========================================================= */

function renderHomeProductSections() {
  const visibleItems = allItems.filter((item) => item.active !== false);

  const deals = getDealItems(visibleItems).slice(0, 8);
  const trending = getTrendingItems(visibleItems).slice(0, 8);

  renderProductList(productsGridDeals, deals, {
    emptyTitle: "No deals yet",
    emptyMessage: "Best deals will appear here when sellers add products."
  });

  renderProductList(productsGridTrending, trending, {
    emptyTitle: "No trending products yet",
    emptyMessage: "Trending products will appear here soon."
  });
}

function getTrendingItems(items) {
  return [...items].sort((a, b) => {
    const aScore =
      Number(a.soldCount || 0) * 3 +
      Number(a.totalReviews || 0) * 2 +
      Number(a.averageRating || 0) * 10 +
      Number(a.createdAt?.seconds || 0) / 1000000000;

    const bScore =
      Number(b.soldCount || 0) * 3 +
      Number(b.totalReviews || 0) * 2 +
      Number(b.averageRating || 0) * 10 +
      Number(b.createdAt?.seconds || 0) / 1000000000;

    return bScore - aScore;
  });
}

function getDealItems(items) {
  return [...items].sort((a, b) => {
    const aDiscount = getDiscountPercent(a);
    const bDiscount = getDiscountPercent(b);

    if (aDiscount !== bDiscount) return bDiscount - aDiscount;

    return getBuyerPrice(a) - getBuyerPrice(b);
  });
}

function renderProductList(grid, items, emptyState = {}) {
  if (!grid) return;

  grid.innerHTML = "";

  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-market-card small-empty">
        <h3>${escapeHtml(emptyState.emptyTitle || "No products found")}</h3>
        <p>${escapeHtml(emptyState.emptyMessage || "Products will appear here soon.")}</p>
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    grid.appendChild(createProductCard(item));
  });
}

/* =========================================================
   FEATURED SHOPS
   ========================================================= */

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
    .sort((a, b) => {
      const aScore = Number(a.averageRating || 0) + Number(a.totalReviews || 0) * 0.05;
      const bScore = Number(b.averageRating || 0) + Number(b.totalReviews || 0) * 0.05;

      return bScore - aScore;
    })
    .slice(0, 10);

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
          : `<div class="shop-logo-fallback">M</div>`
      }

      <strong>${escapeHtml(shop.shopName || "Shop")}</strong>
      <span>Verified Seller</span>
      <small>${rating > 0 ? `${rating.toFixed(1)} (${totalReviews})` : "New shop"}</small>
    `;

    featuredShops.appendChild(card);
  });
}

/* =========================================================
   MAIN MARKETPLACE
   ========================================================= */

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
      ${item.shop?.shopName || ""}
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

  if (marketTitle) {
    marketTitle.textContent = search
      ? `Search results for "${escapeHtml(activeSearch)}"`
      : "Products & Services";
  }

  if (clearSearchTop) {
    clearSearchTop.style.display = search ? "inline-flex" : "none";
  }

  if (resultCount) {
    const categoryText = activeCategory ? ` in ${activeCategory}` : "";

    resultCount.textContent = search
      ? `${filtered.length} matching item(s)${categoryText}`
      : `${filtered.length} item(s) found${categoryText}`;
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
    <div class="empty-market-card">
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

/* =========================================================
   PRODUCT CARD
   ========================================================= */

function createProductCard(item) {
  const productRating = Number(item.averageRating || 0);
  const productReviews = Number(item.totalReviews || 0);
  const buyerPrice = getBuyerPrice(item);
  const location = safeArea(item.shop?.location || item.serviceArea || "Mauritius");

  const ratingText = productRating > 0
    ? `${productRating.toFixed(1)} (${productReviews})`
    : "New";

  const card = document.createElement("article");

  card.className = "market-product-card compact-market-card";

  card.innerHTML = `
    <a class="market-product-img" href="product-details.html?id=${encodeURIComponent(item.id)}">
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

        <button class="product-heart" type="button" aria-label="Save product">
          ♡
        </button>
      </div>

      <h3>${escapeHtml(item.title || "Untitled")}</h3>

      <p class="seller-line">
        <span>Verified</span>
        ${escapeHtml(item.shop?.shopName || "Shop")}
      </p>

      <p class="rating-line-small">${ratingText}</p>

      <p class="product-location">${escapeHtml(location)}</p>

      <p class="price">${formatRs(buyerPrice)}</p>

      <div class="product-card-actions">
        <a class="btn product-main-btn" href="product-details.html?id=${encodeURIComponent(item.id)}">
          View Product
        </a>

        <button class="btn product-add-cart-btn" type="button">
          Add to Cart
        </button>
      </div>
    </div>
  `;

  card.querySelector(".product-heart")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    window.location.href = `product-details.html?id=${encodeURIComponent(item.id)}`;
  });

  card.querySelector(".product-add-cart-btn")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    addProductToCart(item, card, event.currentTarget);
  });

  return card;
}

function getDiscountPercent(item) {
  const oldPrice = Number(item.oldPrice || item.compareAtPrice || 0);
  const price = getBuyerPrice(item);

  if (!oldPrice || !price || oldPrice <= price) return 0;

  return Math.max(0, Math.round(((oldPrice - price) / oldPrice) * 100));
}

function getDiscountBadge(item) {
  const discount = getDiscountPercent(item);

  if (discount <= 0) return "";

  return `<span class="product-discount-badge">-${discount}%</span>`;
}

function getStockBadge(item) {
  if (item.type === "service") return "";

  const stock = Number(item.stock || 0);

  if (stock <= 0) {
    return `<span class="product-stock-badge danger">Out</span>`;
  }

  if (stock <= 5) {
    return `<span class="product-stock-badge">Only ${stock}</span>`;
  }

  return "";
}


/* =========================================================
   CART UX
   ========================================================= */

async function addProductToCart(item, card, button) {
  if (!currentUser) {
    showCartToast("Please login before adding products to your cart.", "error");

    setTimeout(() => {
      window.location.href = "login.html";
    }, 900);

    return;
  }

  const buyerPrice = getBuyerPrice(item);

  if (item.type !== "service" && Number(item.stock || 0) <= 0) {
    showCartToast("This product is currently out of stock.", "error");
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Adding...";

    const cartRef = doc(db, "carts", currentUser.uid, "items", item.id);
    const existingSnap = await getDoc(cartRef);

    const previousQty = existingSnap.exists()
      ? Number(existingSnap.data().quantity || 0)
      : 0;

    const cartItem = {
      productId: item.id,
      sellerId: item.sellerId || "",
      title: item.title || "Untitled",
      type: item.type || "product",
      category: item.category || "",
      imageUrl: item.imageUrl || "",
      shopName: item.shop?.shopName || item.shopName || "MauMarket Seller",

      price: buyerPrice,
      buyerPrice,
      sellerPrice: getSellerPrice(item),
      commissionAmount: getCommissionAmount(item),
      commissionRate: COMMISSION_RATE,

      quantity: previousQty + 1,
      updatedAt: serverTimestamp()
    };

    if (!existingSnap.exists()) {
      cartItem.addedAt = serverTimestamp();
    }

    await setDoc(cartRef, cartItem, { merge: true });

    animateProductToCart(card);
    shakeCartIcon();
    updateAddButton(button);
    showCartToast(`${item.title || "Product"} added to cart.`, "success");

    window.dispatchEvent(new CustomEvent("cart-updated", {
      detail: {
        productId: item.id,
        quantity: cartItem.quantity
      }
    }));
  } catch (error) {
    console.error("Add to cart failed:", error);
    showCartToast(error.message || "Could not add product to cart.", "error");

    button.disabled = false;
    button.textContent = "Add to Cart";
  }
}

function updateAddButton(button) {
  if (!button) return;

  button.disabled = true;
  button.classList.add("added");
  button.textContent = "Added ✓";

  setTimeout(() => {
    button.disabled = false;
    button.classList.remove("added");
    button.textContent = "Add to Cart";
  }, 1100);
}

function animateProductToCart(card) {
  const img = card?.querySelector(".market-product-img img");
  const cartButton = document.querySelector(".mm-cart-btn");

  if (!img || !cartButton) return;

  const imgRect = img.getBoundingClientRect();
  const cartRect = cartButton.getBoundingClientRect();

  const flyingImg = img.cloneNode(true);
  flyingImg.className = "fly-to-cart-img";

  flyingImg.style.left = `${imgRect.left}px`;
  flyingImg.style.top = `${imgRect.top}px`;
  flyingImg.style.width = `${imgRect.width}px`;
  flyingImg.style.height = `${imgRect.height}px`;

  document.body.appendChild(flyingImg);

  requestAnimationFrame(() => {
    flyingImg.style.transform = `
      translate(${cartRect.left - imgRect.left}px, ${cartRect.top - imgRect.top}px)
      scale(.12)
    `;
    flyingImg.style.opacity = "0.2";
  });

  setTimeout(() => {
    flyingImg.remove();
  }, 850);
}

function shakeCartIcon() {
  const cartButton = document.querySelector(".mm-cart-btn");

  if (!cartButton) return;

  cartButton.classList.remove("cart-shake");
  void cartButton.offsetWidth;
  cartButton.classList.add("cart-shake");
}

function showCartToast(message, type = "success") {
  let toast = document.getElementById("cartToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cartToast";
    toast.className = "cart-toast";
    document.body.appendChild(toast);
  }

  toast.className = `cart-toast show ${type}`;
  toast.innerHTML = `
    <strong>${type === "success" ? "Added to cart" : "Cart update"}</strong>
    <span>${escapeHtml(message)}</span>
    <a href="cart.html">View Cart</a>
  `;

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function getSellerPrice(item) {
  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice);
  }

  const buyerPrice = getBuyerPrice(item);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice / (1 + COMMISSION_RATE));
  }

  return 0;
}

function getCommissionAmount(item) {
  const commissionAmount = Number(item.commissionAmount || 0);

  if (commissionAmount > 0) {
    return roundMoney(commissionAmount);
  }

  const buyerPrice = getBuyerPrice(item);
  const sellerPrice = getSellerPrice(item);

  return roundMoney(Math.max(0, buyerPrice - sellerPrice));
}

/* =========================================================
   SEARCH / FILTER EVENTS
   ========================================================= */

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

  const navInput = document.getElementById("mmSearchInput");
  if (navInput && navInput.value !== activeSearch) {
    navInput.value = activeSearch;
  }

  const mobileNavInput = document.getElementById("mmMobileSearchInput");
  if (mobileNavInput && mobileNavInput.value !== activeSearch) {
    mobileNavInput.value = activeSearch;
  }
}

function setCategory(value) {
  activeCategory = value || "";

  if (topCategoryFilter) topCategoryFilter.value = activeCategory;
  if (categoryFilter) categoryFilter.value = activeCategory;
  if (sideCategoryFilter) sideCategoryFilter.value = activeCategory;

  const navCategory = document.getElementById("mmSearchCategory");
  if (navCategory && navCategory.value !== activeCategory) {
    navCategory.value = activeCategory;
  }
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



function attachInstantSearchEvent() {
  window.addEventListener("maumarket:search", (event) => {
    const detail = event.detail || {};

    setSearch(detail.search || "");
    setCategory(detail.category || "");
    renderCategoryIcons();
    updateUrlState();
    renderItems(Boolean(detail.scroll));

    if (detail.scroll) {
      scrollToProducts();
    }
  });
}


function attachSharedNavSearch() {
  /*
    nav.js injects the main search bar dynamically.
    This observer connects that search bar directly to products.js,
    so when the buyer searches from the top bar, the products grid updates
    immediately instead of feeling disconnected.
  */

  const connect = () => {
    const navInput = document.getElementById("mmSearchInput");
    const navCategory = document.getElementById("mmSearchCategory");
    const navForm = document.getElementById("mmSearchForm");

    if (!navInput || navInput.dataset.productsConnected === "true") return;

    navInput.dataset.productsConnected = "true";

    navInput.value = activeSearch;

    navInput.addEventListener("input", () => {
      setSearch(navInput.value);
      renderItems(false);
    });

    navForm?.addEventListener("submit", (event) => {
      event.preventDefault();

      setSearch(navInput.value);

      if (navCategory?.value) {
        setCategory(navCategory.value);
      }

      runSearch(true);
    }, true);

    navCategory?.addEventListener("change", () => {
      setCategory(navCategory.value);
      runSearch(true);
    });
  };

  connect();

  const observer = new MutationObserver(connect);

  observer.observe(document.body, {
    childList: true,
    subtree: true
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

  clearSearchTop?.addEventListener("click", () => {
    setSearch("");
    setCategory("");
    setSort("newest");

    const navInput = document.getElementById("mmSearchInput");
    const navCategory = document.getElementById("mmSearchCategory");

    if (navInput) navInput.value = "";
    if (navCategory) navCategory.value = "";

    runSearch(true);
  });
}

/* =========================================================
   PRICE / FORMAT HELPERS
   ========================================================= */

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

/* =========================================================
   CATEGORY SVG ICONS
   ========================================================= */

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
    baby: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7" r="3" stroke="currentColor" stroke-width="2"/>
        <path d="M6 21a6 6 0 0 1 12 0M9 13l-3 3M15 13l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    gift: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M4 10h16v10H4V10Z" stroke="currentColor" stroke-width="2"/>
        <path d="M3 7h18v3H3V7ZM12 7v13" stroke="currentColor" stroke-width="2"/>
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

/* =========================================================
   ESCAPE
   ========================================================= */

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
