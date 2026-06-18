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

const shopAboutCard = document.getElementById("shopAboutCard");
const shopPolicyCard = document.getElementById("shopPolicyCard");
const shopRatingCard = document.getElementById("shopRatingCard");
const aboutShopBox = document.getElementById("aboutShopBox");
const reviewsBox = document.getElementById("reviewsBox");

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

  const shopSnap = await getDoc(doc(db, "shops", sellerId));

  if (!shopSnap.exists()) {
    shopHeader.innerHTML = "<p>Shop not found.</p>";
    return;
  }

  currentShop = shopSnap.data();

  breadcrumbShop.textContent = currentShop.shopName || "Shop";

  await loadShopItems();
  await loadReviews();

  renderShopHeader();
  renderSidebar();
  renderProducts();
  renderReviews();
}

function renderShopHeader() {
  const banner = currentShop.bannerUrl || currentShop.logoUrl || "";
  const logo = currentShop.logoUrl || "";

  const rating = getAverageRating();
  const reviewCount = shopReviews.length;

  shopHeader.innerHTML = `
    <div class="pro-shop-banner" style="${banner ? `background-image:url('${banner}')` : ""}">
      <div class="pro-shop-overlay"></div>

      <div class="pro-shop-info">
        ${logo ? `<img class="pro-shop-logo" src="${logo}" alt="${currentShop.shopName}">` : `<div class="pro-shop-logo empty-logo">Shop</div>`}

        <div>
          <div class="shop-title-row">
            <h1>${currentShop.shopName || "Shop"}</h1>
            <span class="online-badge">Online</span>
          </div>

          <p>${currentShop.description || "Local MauMarket seller."}</p>

          <div class="shop-meta">
            <span>📍 ${currentShop.location || "Mauritius"}</span>
            <span>☎ ${currentShop.phone || "Not specified"}</span>
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
        <span>Rating</span>
      </div>

      <div>
        <strong>1-2 days</strong>
        <span>Delivery Time</span>
      </div>

      <div>
        <strong>${reviewCount}</strong>
        <span>Reviews</span>
      </div>

      <a class="btn" href="products.html">Continue Shopping</a>
    </div>
  `;
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
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

function renderProducts() {
  let products = [...shopProducts];

  const sort = shopSort?.value || "newest";

  if (sort === "low-high") {
    products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  }

  if (sort === "high-low") {
    products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }

  if (sort === "newest") {
    products.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  }

  shopResultCount.textContent = `Showing ${products.length} item(s)`;

  if (products.length === 0) {
    shopItems.innerHTML = "<p>This shop has no items yet.</p>";
    return;
  }

  shopItems.innerHTML = "";

  products.forEach((item) => {
    const div = document.createElement("div");
    div.className = "pro-product-card";

    div.innerHTML = `
      <div class="pro-product-img">
        ${
          item.imageUrl
            ? `<img src="${item.imageUrl}" alt="${item.title}">`
            : `<div class="no-img">No Image</div>`
        }
      </div>

      <div class="pro-product-body">
        <span class="badge">${item.type || "item"}</span>
        <h3>${item.title || "Untitled"}</h3>
        <p class="muted">${item.category || "Other"}</p>
        <p class="pro-price">Rs ${Number(item.price || 0)}</p>
        <a class="btn" href="product-details.html?id=${item.id}">View Details</a>
      </div>
    `;

    shopItems.appendChild(div);
  });
}

function renderSidebar() {
  shopAboutCard.innerHTML = `
    <h3>About this shop</h3>
    <p>${currentShop.description || "This seller has not added a description yet."}</p>
    <p>📍 ${currentShop.location || "Mauritius"}</p>
    <p>☎ ${currentShop.phone || "Not specified"}</p>
  `;

  shopPolicyCard.innerHTML = `
    <h3>Shop Policies</h3>
    <p>🚚 Delivery in 1-2 working days</p>
    <p>💳 Juice payment accepted</p>
    <p>✅ Verified MauMarket seller</p>
  `;

  shopRatingCard.innerHTML = `
    <h3>Shop Rating</h3>
    <h2>${getAverageRating()} ⭐</h2>
    <p>Based on ${shopReviews.length} review(s)</p>
  `;

  aboutShopBox.innerHTML = shopAboutCard.innerHTML + shopPolicyCard.innerHTML;
}

function renderReviews() {
  if (shopReviews.length === 0) {
    reviewsBox.innerHTML = "<p>No reviews yet.</p>";
    return;
  }

  reviewsBox.innerHTML = shopReviews.map(review => `
    <div class="review-card">
      <h3>${review.sellerRating || 5} ⭐ Seller / ${review.deliveryRating || 5} ⭐ Delivery</h3>
      <p><strong>${review.customerName || "Customer"}</strong></p>
      <p>${review.reviewText || ""}</p>
    </div>
  `).join("");
}

function getAverageRating() {
  if (shopReviews.length === 0) return "0.0";

  const total = shopReviews.reduce((sum, review) => {
    return sum + Number(review.sellerRating || 0);
  }, 0);

  return (total / shopReviews.length).toFixed(1);
}

shopSort?.addEventListener("change", renderProducts);

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}Tab`).classList.add("active");
  });
});

loadShop();
