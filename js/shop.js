import { db } from "./firebase-config.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
const sellerId = params.get("id");

let currentShop = null;
let shopProducts = [];
let shopReviews = [];

async function loadShop() {
  if (!sellerId) {
    shopHeader.innerHTML = "<p>Shop not found.</p>";
    return;
  }

  try {
    const shopSnap = await getDoc(doc(db, "shops", sellerId));

    if (!shopSnap.exists()) {
      shopHeader.innerHTML = "<p>Shop not found.</p>";
      return;
    }

    currentShop = {
      id: sellerId,
      ...shopSnap.data()
    };

    if (breadcrumbShop) {
      breadcrumbShop.textContent = currentShop.shopName || "Shop";
    }

    await loadShopItems();
    await loadReviews();

    renderShopHeader();
    renderSidebar();
    renderProducts();
    renderReviews();
    updateHighlightStats();
  } catch (error) {
    shopHeader.innerHTML = `
      <div class="order-card">
        <h3>Shop could not load</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

async function loadShopItems() {
  const q = query(
    collection(db, "products"),
    where("sellerId", "==", sellerId),
    where("active", "==", true)
  );

  const snapshot = await getDocs(q);

  shopProducts = [];

  snapshot.forEach((docSnap) => {
    shopProducts.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });
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

  shopHeader.innerHTML = `
    <div class="pro-shop-banner" style="${banner ? `background-image:url('${escapeAttr(banner)}')` : ""}">
      <div class="pro-shop-overlay"></div>

      <div class="pro-shop-info">
        ${
          logo
            ? `<img class="pro-shop-logo" src="${escapeAttr(logo)}" alt="${escapeAttr(currentShop.shopName || "Shop")}">`
            : `<div class="pro-shop-logo empty-logo">Shop</div>`
        }

        <div>
          <div class="shop-title-row">
            <h1>${escapeHtml(currentShop.shopName || "Shop")}</h1>
            <span class="online-badge">✓ Verified Seller</span>
          </div>

          <p>${escapeHtml(currentShop.description || "Local MauMarket seller.")}</p>

          <div class="shop-meta">
            <span>📍 ${escapeHtml(currentShop.location || "Mauritius")}</span>
            <span>☎ ${escapeHtml(currentShop.phone || "Not specified")}</span>
            <span>⭐ ${rating} (${reviewCount})</span>
            <span>🚚 ${deliveryRating} delivery</span>
          </div>
        </div>
      </div>
    </div>

    <div class="pro-shop-stats">
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

      <a class="btn" href="products.html">Continue Shopping</a>
    </div>
  `;
}

function renderProducts() {
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
    div.className = "pro-product-card";

    div.innerHTML = `
      <div class="pro-product-img">
        ${
          item.imageUrl
            ? `<img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.title || "Product")}">`
            : `<div class="no-img">No Image</div>`
        }
      </div>

      <div class="pro-product-body">
        <span class="badge">${escapeHtml(item.type || "item")}</span>

        <h3>${escapeHtml(item.title || "Untitled")}</h3>

        <p class="muted">${escapeHtml(item.category || "Other")}</p>

        <p class="rating-line-small">
          ${rating > 0 ? `⭐ ${rating.toFixed(1)} (${totalReviews})` : "⭐ No reviews yet"}
        </p>

        <p class="pro-price">Rs ${Number(item.price || 0)}</p>

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

  shopAboutCard.innerHTML = `
    <h3>About this shop</h3>
    <p>${escapeHtml(currentShop.description || "This seller has not added a description yet.")}</p>
    <p>📍 ${escapeHtml(currentShop.location || "Mauritius")}</p>
    <p>☎ ${escapeHtml(currentShop.phone || "Not specified")}</p>
    <p>✅ Verified MauMarket seller</p>
  `;

  if (shopPolicyCard) {
    shopPolicyCard.innerHTML = `
      <h3>MauMarket Protection</h3>
      <ul class="policy-list">
        <li>✓ Verified Seller</li>
        <li>✓ Secure Checkout</li>
        <li>✓ Delivery Tracking</li>
        <li>✓ Verified Reviews</li>
        <li>✓ Customer Support</li>
      </ul>
    `;
  }

  shopRatingCard.innerHTML = `
    <h3>Shop Rating</h3>
    <h2>${rating} ⭐</h2>
    <p>Based on ${shopReviews.length} review(s)</p>
    <hr>
    <p><strong>Delivery:</strong> ${deliveryRating} ⭐</p>
    <p><strong>Products:</strong> ${shopProducts.length}</p>
  `;

  aboutShopBox.innerHTML = `
    <h3>${escapeHtml(currentShop.shopName || "Shop")}</h3>
    <p>${escapeHtml(currentShop.description || "This seller has not added a description yet.")}</p>
    <p>📍 ${escapeHtml(currentShop.location || "Mauritius")}</p>
    <p>☎ ${escapeHtml(currentShop.phone || "Not specified")}</p>
    <p>⭐ Seller Rating: ${rating}</p>
    <p>🚚 Delivery Rating: ${deliveryRating}</p>
    <p>✅ Verified MauMarket Seller</p>
  `;
}

function renderReviews() {
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

function stars(value) {
  const rating = Math.max(1, Math.min(5, Math.round(Number(value || 0))));
  return "⭐".repeat(rating);
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
