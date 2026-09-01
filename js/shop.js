import { db } from "./firebase-config.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


/* =========================================================
   SHOP PAGE ONLY — REMOVE "SHOP CATEGORIES" PANEL
   =========================================================
   The categories panel is not part of this shop.js file itself.
   It can be injected by shared navigation/layout code, so this
   removes it whenever it appears on the individual shop page.
*/
function removeShopCategoriesPanel() {
  const knownSelectors = [
    "#shopsCategoryList",
    ".shops-directory-sidebar",
    ".shop-categories-sidebar",
    ".shop-category-sidebar",
    ".shops-category-sidebar",
    ".category-sidebar",
    ".categories-sidebar",
    ".shop-categories-panel",
    ".shops-categories-panel"
  ];

  knownSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      const panel =
        element.closest(".filter-card") ||
        element.closest(".shops-directory-sidebar") ||
        element.closest("aside") ||
        element;

      if (panel && panel.isConnected) {
        panel.remove();
      }
    });
  });

  // Fallback for a shared component whose class/id may be different.
  document.querySelectorAll("aside, section, .filter-card").forEach((element) => {
    if (!element.isConnected) return;

    const text = String(element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const hasShopCategoriesHeading =
      text.startsWith("browse shop categories") ||
      text.startsWith("shop categories");

    if (hasShopCategoriesHeading) {
      element.remove();
    }
  });
}

removeShopCategoriesPanel();

const shopCategoriesObserver = new MutationObserver(() => {
  removeShopCategoriesPanel();
});

shopCategoriesObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener("load", removeShopCategoriesPanel);

const shopHeader = document.getElementById("shopHeader");
const shopItems = document.getElementById("shopItems");
const breadcrumbShop = document.getElementById("breadcrumbShop");
const shopResultCount = document.getElementById("shopResultCount");
const shopSort = document.getElementById("shopSort");
const shopProductSearch = document.getElementById("shopProductSearch");

const shopAboutCard = document.getElementById("shopAboutCard");
const shopPolicyCard = document.getElementById("shopPolicyCard");
const shopRatingCard = document.getElementById("shopRatingCard");
const aboutShopBox = document.getElementById("aboutShopBox");
const reviewsBox = document.getElementById("reviewsBox");

const shopProductCount = document.getElementById("shopProductCount");
const shopReviewCount = document.getElementById("shopReviewCount");
const shopRatingAverage = document.getElementById("shopRatingAverage");
const reviewsAverageRating = document.getElementById("reviewsAverageRating");
const reviewsTotalCount = document.getElementById("reviewsTotalCount");

const params = new URLSearchParams(window.location.search);
const requestedSellerId = params.get("id") || "";
const requestedShopSlug = normalizeShopSlug(params.get("shop") || "");

let sellerId = "";
let currentShop = null;
let shopProducts = [];
let shopReviews = [];

async function loadShop() {
  if (!requestedSellerId && !requestedShopSlug) {
    renderShopNotFound("This shop link is incomplete. Please return to the shops directory.");
    return;
  }

  try {
    const resolvedShop = await resolveRequestedShop();

    if (!resolvedShop) {
      renderShopNotFound("The requested shop could not be found or is no longer available.");
      return;
    }

    currentShop = resolvedShop;
    sellerId = currentShop.ownerId || currentShop.sellerId || currentShop.id;

    if (!sellerId) {
      renderShopNotFound("This shop is missing its seller information.");
      return;
    }

    if (currentShop.active === false || currentShop.approved === false) {
      renderShopNotFound("This shop is currently unavailable.");
      return;
    }

    updateCanonicalShopUrl();

    if (breadcrumbShop) {
      breadcrumbShop.textContent = currentShop.shopName || "Shop";
    }

    document.title = `${currentShop.shopName || "Shop"} | MauMarket`;

    /*
      Render the shop immediately.
      Products and reviews are secondary data, so a permission/index issue in
      either collection must never leave the whole public shop page blank.
    */
    renderShopHeader();
    renderTrustStrip();
    renderFeaturedShopElements();
    renderSidebar();
    renderProductsLoading();
    renderReviewsLoading();
    updateHighlightStats();

    const [productsResult, reviewsResult] = await Promise.allSettled([
      loadShopItems(),
      loadReviews()
    ]);

    if (productsResult.status === "rejected") {
      console.warn("Shop products could not load:", productsResult.reason);
      shopProducts = [];
      renderProductsError(productsResult.reason);
    } else {
      renderProducts();
    }

    if (reviewsResult.status === "rejected") {
      console.warn("Shop reviews could not load:", reviewsResult.reason);
      shopReviews = [];
      renderReviewsError(reviewsResult.reason);
    } else {
      renderReviews();
    }

    /*
      Refresh elements that depend on product/review totals.
    */
    renderShopHeader();
    renderFeaturedShopElements();
    renderSidebar();
    updateHighlightStats();
  } catch (error) {
    console.error("Shop could not load:", error);
    if (shopHeader) {
      shopHeader.innerHTML = `<div class="order-card"><h3>Shop could not load</h3><p>${escapeHtml(error.message || "Please try again later.")}</p></div>`;
    }
  }
}

async function resolveRequestedShop() {
  if (requestedShopSlug) {
    /*
      Preferred lookup using the current slug field.
    */
    const slugQuery = query(
      collection(db, "shops"),
      where("slug", "==", requestedShopSlug),
      limit(1)
    );

    const slugSnapshot = await getDocs(slugQuery);

    if (!slugSnapshot.empty) {
      const shopDoc = slugSnapshot.docs[0];
      return { id: shopDoc.id, ...shopDoc.data() };
    }

    /*
      Backward compatibility for older shop documents.
    */
    const legacySlugQuery = query(
      collection(db, "shops"),
      where("shopSlug", "==", requestedShopSlug),
      limit(1)
    );

    const legacySlugSnapshot = await getDocs(legacySlugQuery);

    if (!legacySlugSnapshot.empty) {
      const shopDoc = legacySlugSnapshot.docs[0];
      return { id: shopDoc.id, ...shopDoc.data() };
    }

    /*
      Final fallback: read available shops and compare normalized values.
      This helps when a historical slug contains uppercase letters or spaces.
    */
    const shopsSnapshot = await getDocs(collection(db, "shops"));

    const matchingShop = shopsSnapshot.docs.find((shopDoc) => {
      const data = shopDoc.data();

      return normalizeShopSlug(
        data.slug ||
        data.shopSlug ||
        data.shopName ||
        ""
      ) === requestedShopSlug;
    });

    if (matchingShop) {
      return {
        id: matchingShop.id,
        ...matchingShop.data()
      };
    }
  }

  if (requestedSellerId) {
    const directSnap = await getDoc(doc(db, "shops", requestedSellerId));

    if (directSnap.exists()) {
      return {
        id: directSnap.id,
        ...directSnap.data()
      };
    }

    const ownerQuery = query(
      collection(db, "shops"),
      where("ownerId", "==", requestedSellerId),
      limit(1)
    );

    const ownerSnapshot = await getDocs(ownerQuery);

    if (!ownerSnapshot.empty) {
      const shopDoc = ownerSnapshot.docs[0];

      return {
        id: shopDoc.id,
        ...shopDoc.data()
      };
    }

    const sellerQuery = query(
      collection(db, "shops"),
      where("sellerId", "==", requestedSellerId),
      limit(1)
    );

    const sellerSnapshot = await getDocs(sellerQuery);

    if (!sellerSnapshot.empty) {
      const shopDoc = sellerSnapshot.docs[0];

      return {
        id: shopDoc.id,
        ...shopDoc.data()
      };
    }
  }

  return null;
}

function renderShopNotFound(message) {
  if (shopHeader) {
    shopHeader.innerHTML = `
      <div class="order-card">
        <h3>Shop not found</h3>
        <p>${escapeHtml(message)}</p>

        <div class="seller-actions">
          <a class="btn" href="shops.html">Browse Shops</a>
          <a class="secondary-btn" href="products.html">Browse Marketplace</a>
        </div>
      </div>
    `;
  }

  if (shopItems) {
    shopItems.innerHTML = "";
  }

  if (shopResultCount) {
    shopResultCount.textContent = "0 items";
  }

  document.getElementById("featuredShopHeroBadge")?.replaceChildren();

  const featuredCard = document.getElementById("featuredShopCard");

  if (featuredCard) {
    featuredCard.style.display = "none";
  }
}

function updateCanonicalShopUrl() {
  const slug = normalizeShopSlug(
    currentShop?.slug ||
    currentShop?.shopSlug ||
    currentShop?.shopName ||
    ""
  );

  if (!slug) return;

  const canonicalUrl =
    `${window.location.pathname}?shop=${encodeURIComponent(slug)}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (canonicalUrl !== currentUrl) window.history.replaceState({}, "", canonicalUrl);
}

async function loadShopItems() {
  const productsQuery = query(collection(db, "products"), where("sellerId", "==", sellerId));
  const snapshot = await getDocs(productsQuery);
  shopProducts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).filter((item) => item.active !== false);
}

async function loadReviews() {
  const q = query(
    collection(db, "reviews"),
    where("sellerIds", "array-contains", sellerId)
  );

  const snapshot = await getDocs(q);

  shopReviews = [];

  snapshot.forEach((docSnap) => {
    shopReviews.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  shopReviews.sort((a, b) => {
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });
}

function renderShopHeader() {
  const banner = currentShop.bannerUrl || currentShop.logoUrl || "";
  const logo = currentShop.logoUrl || "";

  const rating = getAverageSellerRating();
  const reviewCount = shopReviews.length;
  const deliveryRating = getAverageDeliveryRating();
  const area = safeArea(currentShop.location);

  shopHeader.innerHTML = `
    <div class="pro-shop-banner shop-wow-banner" style="${banner ? `background-image:url('${escapeAttr(banner)}')` : ""}">
      <div class="pro-shop-overlay shop-wow-overlay"></div>

      <div class="pro-shop-info shop-wow-info">
        ${
          logo
            ? `<img class="pro-shop-logo shop-wow-logo" src="${escapeAttr(logo)}" alt="${escapeAttr(currentShop.shopName || "Shop")}">`
            : `<div class="pro-shop-logo empty-logo shop-wow-logo">Shop</div>`
        }

        <div class="shop-wow-main">
          <div class="shop-title-row">
            <h1>${escapeHtml(currentShop.shopName || "Shop")}</h1>
            <span class="online-badge">✓ Verified Seller</span>
          </div>

          <p>${escapeHtml(currentShop.description || "Trusted MauMarket seller.")}</p>

          <div class="shop-meta">
            <span>📍 ${escapeHtml(area)}</span>
            <span>⭐ ${rating} (${reviewCount})</span>
            <span>🚚 ${deliveryRating} Delivery</span>
            <span>🛡️ Protected by MauMarket</span>
          </div>
        </div>
      </div>
    </div>

    <div class="pro-shop-stats shop-wow-stats">
      <div>
        <strong>${shopProducts.length}</strong>
        <span>Products</span>
      </div>

      <div>
        <strong>${rating}</strong>
        <span>Seller Rating</span>
      </div>

      <div>
        <strong>${deliveryRating}</strong>
        <span>Delivery Rating</span>
      </div>

      <div>
        <strong>${reviewCount}</strong>
        <span>Reviews</span>
      </div>

      <div class="shop-wow-actions">
        <button id="copyCurrentShopLinkBtn" type="button" class="secondary-btn">Copy Shop Link</button>
        <button id="shareCurrentShopLinkBtn" type="button" class="secondary-btn">Share Shop</button>
        <a class="btn" href="products.html">Continue Shopping</a>
      </div>
    </div>
  `;

  bindShopShareActions();
}

function getCurrentPublicShopUrl() {
  const slug = normalizeShopSlug(
    currentShop?.slug ||
    currentShop?.shopSlug ||
    currentShop?.shopName ||
    ""
  );

  if (slug) {
    return `${getProjectBaseUrl()}shop.html?shop=${encodeURIComponent(slug)}`;
  }

  return `${getProjectBaseUrl()}shop.html?id=${encodeURIComponent(sellerId)}`;
}

function getProjectBaseUrl() {
  const url = new URL(window.location.href);
  const parts = url.pathname.split("/");
  parts.pop();
  return `${url.origin}${parts.join("/")}/`;
}

function bindShopShareActions() {
  document.getElementById("copyCurrentShopLinkBtn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    try {
      await navigator.clipboard.writeText(getCurrentPublicShopUrl());
      button.textContent = "Copied!";
      setTimeout(() => { button.textContent = originalText; }, 1600);
    } catch {
      window.prompt("Copy this shop link:", getCurrentPublicShopUrl());
    }
  });

  document.getElementById("shareCurrentShopLinkBtn")?.addEventListener("click", async () => {
    const shareData = { title: `${currentShop?.shopName || "MauMarket Shop"} | MauMarket`, text: `Visit ${currentShop?.shopName || "this shop"} on MauMarket.`, url: getCurrentPublicShopUrl() };
    try {
      if (navigator.share) { await navigator.share(shareData); return; }
      await navigator.clipboard.writeText(shareData.url);
      window.alert("Shop link copied.");
    } catch (error) {
      if (error?.name !== "AbortError") window.prompt("Copy this shop link:", shareData.url);
    }
  });
}

function renderTrustStrip() {
  let trustStrip = document.getElementById("shopTrustStrip");

  if (!trustStrip) {
    trustStrip = document.createElement("section");
    trustStrip.id = "shopTrustStrip";
    trustStrip.className = "shop-trust-strip";

    shopHeader.insertAdjacentElement("afterend", trustStrip);
  }

  trustStrip.innerHTML = `
    <div class="shop-trust-item">
      <span>🛡️</span>
      <div>
        <strong>Verified MauMarket Seller</strong>
        <small>Seller identity checked by MauMarket.</small>
      </div>
    </div>

    <div class="shop-trust-item">
      <span>🔒</span>
      <div>
        <strong>Secure Payments</strong>
        <small>Payments stay protected through MauMarket.</small>
      </div>
    </div>

    <div class="shop-trust-item">
      <span>🚚</span>
      <div>
        <strong>Delivery Through MauMarket</strong>
        <small>Delivery is handled and tracked by the platform.</small>
      </div>
    </div>

    <div class="shop-trust-item">
      <span>⭐</span>
      <div>
        <strong>Verified Reviews</strong>
        <small>Reviews come from real buyers.</small>
      </div>
    </div>
  `;
}


function renderProductsLoading() {
  if (!shopItems) return;

  shopItems.innerHTML = `
    <div class="order-card">
      <h3>Loading products...</h3>
      <p class="muted">Please wait while this shop catalogue loads.</p>
    </div>
  `;

  if (shopResultCount) {
    shopResultCount.textContent = "Loading items...";
  }
}

function renderReviewsLoading() {
  if (!reviewsBox) return;

  reviewsBox.innerHTML = `
    <div class="order-card">
      <h3>Loading reviews...</h3>
      <p class="muted">Please wait while verified buyer feedback loads.</p>
    </div>
  `;
}

function renderProductsError(error) {
  if (!shopItems) return;

  shopItems.innerHTML = `
    <div class="order-card">
      <h3>Products temporarily unavailable</h3>
      <p>
        The shop loaded successfully, but its products could not be displayed
        right now. Please refresh the page shortly.
      </p>
    </div>
  `;

  if (shopResultCount) {
    shopResultCount.textContent = "Products unavailable";
  }
}

function renderReviewsError(error) {
  if (!reviewsBox) return;

  reviewsBox.innerHTML = `
    <div class="order-card">
      <h3>Reviews temporarily unavailable</h3>
      <p class="muted">
        This shop is available, but its reviews could not be loaded right now.
      </p>
    </div>
  `;

  if (reviewsAverageRating) {
    reviewsAverageRating.textContent = "0.0";
  }

  if (reviewsTotalCount) {
    reviewsTotalCount.textContent = "0";
  }
}

function renderFeaturedShopElements() {
  const heroBadge = document.getElementById("featuredShopHeroBadge");
  const featuredCard = document.getElementById("featuredShopCard");
  const featured = isActiveFeaturedShop(currentShop);

  if (heroBadge) {
    heroBadge.innerHTML = featured
      ? `
          <div class="featured-shop-hero-badge">
            <span>★</span>
            Featured MauMarket Shop
          </div>
        `
      : "";
  }

  if (!featuredCard) return;

  if (!featured) {
    featuredCard.style.display = "none";
    featuredCard.innerHTML = "";
    return;
  }

  featuredCard.style.display = "";

  const expiry = timestampToDate(currentShop?.featuredExpiry);
  const expiryText = expiry
    ? expiry.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    : "Active";

  featuredCard.innerHTML = `
    <div class="premium-sidebar-heading">
      <div class="premium-sidebar-icon">★</div>
      <h3>Featured Shop</h3>
    </div>

    <p>
      This seller has an active Featured Shop subscription verified by
      MauMarket.
    </p>

    <div class="verified-box">
      <strong>Featured until ${escapeHtml(expiryText)}</strong>
      <p>Priority visibility in the MauMarket shop directory.</p>
    </div>
  `;
}

function isActiveFeaturedShop(shop) {
  if (!shop) return false;

  const expiry = timestampToDate(shop.featuredExpiry);

  return (
    shop.featuredShop === true &&
    String(shop.featuredStatus || "").toLowerCase() === "active" &&
    shop.featuredPaymentVerified === true &&
    shop.showInExploreShops === true &&
    expiry instanceof Date &&
    !Number.isNaN(expiry.getTime()) &&
    expiry.getTime() > Date.now()
  );
}

function timestampToDate(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function renderProducts() {
  if (!shopItems) return;

  let products = [...shopProducts];

  const sort = shopSort?.value || "newest";
  const search = (shopProductSearch?.value || "").toLowerCase().trim();

  if (search) {
    products = products.filter((item) => {
      const text = `
        ${item.title || ""}
        ${item.description || ""}
        ${item.category || ""}
        ${item.type || ""}
        ${item.price || ""}
      `.toLowerCase();

      return text.includes(search);
    });
  }

  if (sort === "low-high") {
    products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  }

  if (sort === "high-low") {
    products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }

  if (sort === "newest") {
    products.sort((a, b) => {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
  }

  if (sort === "rating") {
    products.sort((a, b) => {
      return Number(b.averageRating || 0) - Number(a.averageRating || 0);
    });
  }

  if (shopResultCount) {
    shopResultCount.textContent = `Showing ${products.length} item(s)`;
  }

  if (products.length === 0) {
    shopItems.innerHTML = `
      <div class="order-card">
        <h3>No items found</h3>
        <p>This shop has no matching items.</p>
      </div>
    `;
    return;
  }

  shopItems.innerHTML = "";

  products.forEach((item) => {
    const rating = Number(item.averageRating || 0);
    const totalReviews = Number(item.totalReviews || 0);

    const div = document.createElement("div");
    div.className = "pro-product-card shop-wow-product-card";

    div.innerHTML = `
      <a class="pro-product-img" href="product-details.html?id=${encodeURIComponent(item.id)}">
        ${
          item.imageUrl
            ? `<img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.title || "Product")}">`
            : `<div class="no-img">No Image</div>`
        }
      </a>

      <div class="pro-product-body">
        <div class="product-card-top-row">
          <span class="badge">${escapeHtml(item.type || "item")}</span>
          <span class="product-heart">♡</span>
        </div>

        <h3>${escapeHtml(item.title || "Untitled")}</h3>

        <p class="muted">✅ Verified Product</p>

        <p class="rating-line-small">
          ${rating > 0 ? `⭐ ${rating.toFixed(1)} (${totalReviews})` : "⭐ No reviews yet"}
        </p>

        <p class="pro-price">Rs ${Number(item.price || 0).toLocaleString("en-US")}</p>

        <a class="btn" href="product-details.html?id=${encodeURIComponent(item.id)}">
          View Details
        </a>
      </div>
    `;

    shopItems.appendChild(div);
  });
}

function renderSidebar() {
  const rating = getAverageSellerRating();
  const deliveryRating = getAverageDeliveryRating();
  const area = safeArea(currentShop.location);

  if (shopAboutCard) {
    shopAboutCard.innerHTML = `
    <h3>About this shop</h3>
    <p>${escapeHtml(currentShop.description || "This seller has not added a description yet.")}</p>

    <div class="shop-safe-info">
      <p>📍 ${escapeHtml(area)}</p>
      <p>🗓️ Shop on MauMarket since ${getShopSinceText()}</p>
    </div>

    <div class="verified-box">
      <strong>✅ Verified MauMarket Seller</strong>
      <p>This seller has been checked by the MauMarket team.</p>
    </div>

    <p class="muted">
      Contact is handled safely through MauMarket after checkout.
    </p>
    `;
  }

  if (shopPolicyCard) {
    shopPolicyCard.innerHTML = `
      <h3>MauMarket Protection</h3>
      <ul class="policy-list shop-policy-list">
        <li>✅ Verified Seller</li>
        <li>✅ Secure Checkout</li>
        <li>✅ Delivery Tracking</li>
        <li>✅ Verified Reviews</li>
        <li>✅ Customer Support</li>
      </ul>
    `;
  }

  if (shopRatingCard) {
    shopRatingCard.innerHTML = `
    <h3>Shop Rating</h3>
    <h2>${rating} ⭐</h2>
    <p>Based on ${shopReviews.length} review(s)</p>

    <div class="rating-bars">
      ${ratingBar(5)}
      ${ratingBar(4)}
      ${ratingBar(3)}
      ${ratingBar(2)}
      ${ratingBar(1)}
    </div>

    <hr>
    <p><strong>Delivery:</strong> ${deliveryRating} ⭐</p>
    <p><strong>Products:</strong> ${shopProducts.length}</p>
    `;
  }

  if (aboutShopBox) {
    aboutShopBox.innerHTML = `
    <h3>${escapeHtml(currentShop.shopName || "Shop")}</h3>
    <p>${escapeHtml(currentShop.description || "This seller has not added a description yet.")}</p>
    <p>📍 ${escapeHtml(area)}</p>
    <p>⭐ Seller Rating: ${rating}</p>
    <p>🚚 Delivery Rating: ${deliveryRating}</p>
    <p>✅ Verified MauMarket Seller</p>
    <p>🛡️ Payment and delivery protected by MauMarket.</p>
    `;
  }
}

function renderReviews() {
  if (!reviewsBox) return;

  const rating = getAverageSellerRating();

  if (reviewsAverageRating) reviewsAverageRating.textContent = rating;
  if (reviewsTotalCount) reviewsTotalCount.textContent = String(shopReviews.length);

  if (shopReviews.length === 0) {
    reviewsBox.innerHTML = `
      <div class="order-card">
        <h3>No reviews yet</h3>
        <p class="muted">This seller has no verified reviews yet.</p>
      </div>
    `;
    return;
  }

  reviewsBox.innerHTML = shopReviews.map((review) => {
    const sellerRating = Number(review.sellerRating || review.rating || 0);
    const deliveryRating = Number(review.deliveryRating || 0);

    return `
      <div class="review-card order-card">
        <h3>${stars(sellerRating)} ${sellerRating.toFixed(1)} Seller</h3>
        <p><strong>${escapeHtml(review.customerName || "Customer")}</strong></p>
        <p>${escapeHtml(review.reviewText || "")}</p>
        <p class="muted">
          🚚 Delivery: ${deliveryRating ? `${stars(deliveryRating)} ${deliveryRating.toFixed(1)}` : "Not rated"}
        </p>
        <p class="muted">Verified Purchase</p>
      </div>
    `;
  }).join("");
}

function updateHighlightStats() {
  const sellerRating = getAverageSellerRating();

  if (shopProductCount) shopProductCount.textContent = String(shopProducts.length);
  if (shopReviewCount) shopReviewCount.textContent = String(shopReviews.length);
  if (shopRatingAverage) shopRatingAverage.textContent = sellerRating;
  if (reviewsAverageRating) reviewsAverageRating.textContent = sellerRating;
  if (reviewsTotalCount) reviewsTotalCount.textContent = String(shopReviews.length);
}

function getAverageSellerRating() {
  if (currentShop?.averageRating) {
    return Number(currentShop.averageRating).toFixed(1);
  }

  if (shopReviews.length === 0) return "0.0";

  const total = shopReviews.reduce((sum, review) => {
    return sum + Number(review.sellerRating || review.rating || 0);
  }, 0);

  return (total / shopReviews.length).toFixed(1);
}

function getAverageDeliveryRating() {
  if (shopReviews.length === 0) return "0.0";

  const validReviews = shopReviews.filter((review) => {
    return Number(review.deliveryRating || 0) > 0;
  });

  if (validReviews.length === 0) return "0.0";

  const total = validReviews.reduce((sum, review) => {
    return sum + Number(review.deliveryRating || 0);
  }, 0);

  return (total / validReviews.length).toFixed(1);
}

function getReviewCountByRating(ratingValue) {
  return shopReviews.filter((review) => {
    const rating = Math.round(Number(review.sellerRating || review.rating || 0));
    return rating === ratingValue;
  }).length;
}

function ratingBar(ratingValue) {
  const count = getReviewCountByRating(ratingValue);
  const total = shopReviews.length || 1;
  const width = Math.round((count / total) * 100);

  return `
    <div class="rating-bar-row">
      <span>${ratingValue} ⭐</span>
      <div class="rating-bar-track">
        <div class="rating-bar-fill" style="width:${width}%"></div>
      </div>
      <strong>${count}</strong>
    </div>
  `;
}

function getShopSinceText() {
  const createdAt = currentShop?.createdAt?.seconds;

  if (!createdAt) return "recently";

  const date = new Date(createdAt * 1000);

  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric"
  });
}

function normalizeShopSlug(value) {
  return String(value || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
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

function stars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return rating > 0 ? "⭐".repeat(rating) : "No rating";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

shopSort?.addEventListener("change", renderProducts);
shopProductSearch?.addEventListener("input", renderProducts);

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    btn.classList.add("active");

    const target = document.getElementById(`${btn.dataset.tab}Tab`);

    if (target) {
      target.classList.add("active");
    }
  });
});

loadShop();
