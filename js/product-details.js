import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const detailsBox = document.getElementById("detailsBox");
const relatedItems = document.getElementById("relatedItems");

const params = new URLSearchParams(window.location.search);
const itemId = params.get("id");

let currentUser = null;
let currentItem = null;
let currentShop = null;
let productReviews = [];
let shopReviews = [];
let isWishlisted = false;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  await loadDetails();
});

async function loadDetails() {
  if (!itemId) {
    detailsBox.innerHTML = "<p>Item not found.</p>";
    return;
  }

  const itemSnap = await getDoc(doc(db, "products", itemId));

  if (!itemSnap.exists()) {
    detailsBox.innerHTML = "<p>Item not found.</p>";
    return;
  }

  currentItem = {
    id: itemSnap.id,
    ...itemSnap.data()
  };

  currentShop = {
    shopName: "Unknown Shop",
    averageRating: 0,
    totalReviews: 0
  };

  if (currentItem.sellerId) {
    const shopSnap = await getDoc(doc(db, "shops", currentItem.sellerId));

    if (shopSnap.exists()) {
      currentShop = {
        id: currentItem.sellerId,
        ...shopSnap.data()
      };
    }
  }

  await loadProductReviews();
  await loadShopReviews();
  await checkWishlistStatus();

  renderDetails();
  await loadRelatedItems();
}

async function checkWishlistStatus() {
  isWishlisted = false;

  if (!currentUser || !itemId) return;

  try {
    const wishSnap = await getDoc(
      doc(db, "wishlists", currentUser.uid, "items", itemId)
    );

    isWishlisted = wishSnap.exists();
  } catch (error) {
    console.warn("Wishlist check failed:", error.message);
  }
}

async function loadProductReviews() {
  const q = query(
    collection(db, "reviews"),
    where("productIds", "array-contains", itemId)
  );

  const snapshot = await getDocs(q);

  productReviews = [];

  snapshot.forEach((docSnap) => {
    productReviews.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  productReviews.sort((a, b) => {
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });
}

async function loadShopReviews() {
  if (!currentItem.sellerId) {
    shopReviews = [];
    return;
  }

  const q = query(
    collection(db, "reviews"),
    where("sellerIds", "array-contains", currentItem.sellerId)
  );

  const snapshot = await getDocs(q);

  shopReviews = [];

  snapshot.forEach((docSnap) => {
    shopReviews.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });
}

function renderDetails() {
  const productAverageRating = Number(
    currentItem.averageRating || getAverageRating(productReviews, "sellerRating") || 0
  );

  const productTotalReviews = Number(
    currentItem.totalReviews || productReviews.length || 0
  );

  const shopAverageRating = Number(
    currentShop.averageRating || getAverageRating(shopReviews, "sellerRating") || 0
  );

  const shopTotalReviews = Number(
    currentShop.totalReviews || shopReviews.length || 0
  );

  const productRatingText = productAverageRating > 0
    ? `⭐ ${productAverageRating.toFixed(1)} (${productTotalReviews} review${productTotalReviews === 1 ? "" : "s"})`
    : "⭐ No product reviews yet";

  const shopRatingText = shopAverageRating > 0
    ? `⭐ ${shopAverageRating.toFixed(1)} (${shopTotalReviews} shop review${shopTotalReviews === 1 ? "" : "s"})`
    : "⭐ No shop reviews yet";

  const reviewsHtml = renderReviewsList();

  detailsBox.innerHTML = `
    <section class="pro-product-details">
      <div class="pro-gallery">
        ${
          currentItem.imageUrl
            ? `<img class="main-product-img" src="${escapeHtml(currentItem.imageUrl)}" alt="${escapeHtml(currentItem.title || "Product")}">`
            : `<div class="main-product-img no-img">No Image</div>`
        }
      </div>

      <div class="pro-product-info">
        <span class="badge">${escapeHtml(currentItem.type || "item")}</span>

        <h1>${escapeHtml(currentItem.title || "Untitled")}</h1>

        <p class="muted">${escapeHtml(currentItem.category || "Other")}</p>

        <p class="rating-line">${productRatingText}</p>

        <h2 class="product-price">Rs ${Number(currentItem.price || 0)}</h2>

        <p>${escapeHtml(currentItem.description || "No description provided.")}</p>

        ${
          currentItem.type === "product"
            ? `<p><strong>Stock:</strong> ${Number(currentItem.stock || 0)}</p>`
            : `<p><strong>Service Area:</strong> ${escapeHtml(currentItem.serviceArea || "Not specified")}</p>`
        }

        <div class="cart-actions">
          <input id="qtyInput" type="number" min="1" value="1">
          <button id="addToCartBtn">Add to Cart</button>
          <button id="wishlistBtn" class="secondary-btn" type="button">
            ${isWishlisted ? "♥ Saved" : "♡ Save"}
          </button>
        </div>

        <p id="cartMessage"></p>
        <p id="wishlistMessage"></p>
      </div>

      <aside class="buy-box">
        <h3>Seller</h3>

        <div class="mini-shop">
          ${
            currentShop.logoUrl
              ? `<img src="${escapeHtml(currentShop.logoUrl)}" alt="${escapeHtml(currentShop.shopName || "Shop")}">`
              : ""
          }

          <div>
            <strong>${escapeHtml(currentShop.shopName || "Shop")}</strong>
            <p>${shopRatingText}</p>
            <p class="muted">✓ Verified Seller</p>
          </div>
        </div>

        <p>📍 ${escapeHtml(currentShop.location || "Mauritius")}</p>
        <p>☎ ${escapeHtml(currentShop.phone || "Not specified")}</p>
        <p>🚚 Delivery by MauMarket</p>

        <a class="btn" href="shop.html?id=${encodeURIComponent(currentItem.sellerId || "")}">
          Visit Shop
        </a>

        <a class="secondary-btn" href="wishlist.html">
          View Wishlist
        </a>
      </aside>
    </section>

    <section class="form-card product-reviews-section">
      <div class="section-row-title">
        <h2>Customer Reviews</h2>
        <span>${productRatingText}</span>
      </div>

      ${reviewsHtml}
    </section>
  `;

  document.getElementById("addToCartBtn")?.addEventListener("click", addToCart);
  document.getElementById("wishlistBtn")?.addEventListener("click", toggleWishlist);
}

function renderReviewsList() {
  if (productReviews.length === 0) {
    return `
      <div class="order-card">
        <h3>No reviews yet</h3>
        <p class="muted">Be the first to review this product after a verified purchase.</p>
      </div>
    `;
  }

  return productReviews.slice(0, 8).map((review) => {
    const rating = Number(review.sellerRating || review.rating || 0);
    const stars = "⭐".repeat(Math.max(1, Math.min(5, Math.round(rating))));

    return `
      <div class="order-card review-card">
        <h3>${stars} ${rating ? rating.toFixed(1) : ""}</h3>
        <p><strong>${escapeHtml(review.customerName || "Customer")}</strong></p>
        <p>${escapeHtml(review.reviewText || "")}</p>
        <p class="muted">Verified Purchase</p>
      </div>
    `;
  }).join("");
}

async function loadRelatedItems() {
  if (!currentItem.category || !relatedItems) return;

  const q = query(
    collection(db, "products"),
    where("category", "==", currentItem.category),
    where("active", "==", true)
  );

  const snapshot = await getDocs(q);

  const items = [];

  snapshot.forEach((docSnap) => {
    if (docSnap.id !== currentItem.id) {
      items.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    }
  });

  if (items.length === 0) {
    relatedItems.innerHTML = "<p>No related items found.</p>";
    return;
  }

  relatedItems.innerHTML = "";

  items.slice(0, 8).forEach((item) => {
    const rating = Number(item.averageRating || 0);
    const totalReviews = Number(item.totalReviews || 0);

    const div = document.createElement("div");
    div.className = "pro-product-card";

    div.innerHTML = `
      <div class="pro-product-img">
        ${
          item.imageUrl
            ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Product")}">`
            : `<div class="no-img">No Image</div>`
        }
      </div>

      <div class="pro-product-body">
        <span class="badge">${escapeHtml(item.type || "item")}</span>

        <h3>${escapeHtml(item.title || "Untitled")}</h3>

        <p class="muted">${escapeHtml(item.category || "")}</p>

        <p class="rating-line-small">
          ${rating > 0 ? `⭐ ${rating.toFixed(1)} (${totalReviews})` : "⭐ No reviews yet"}
        </p>

        <p class="pro-price">Rs ${Number(item.price || 0)}</p>

        <a class="btn" href="product-details.html?id=${encodeURIComponent(item.id)}">
          View Details
        </a>
      </div>
    `;

    relatedItems.appendChild(div);
  });
}

async function toggleWishlist() {
  const wishlistMessage = document.getElementById("wishlistMessage");
  const wishlistBtn = document.getElementById("wishlistBtn");

  if (!currentUser) {
    wishlistMessage.textContent = "Please login first.";

    setTimeout(() => {
      window.location.href = "login.html";
    }, 800);

    return;
  }

  wishlistBtn.disabled = true;

  try {
    const wishlistRef = doc(db, "wishlists", currentUser.uid, "items", currentItem.id);

    if (isWishlisted) {
      await deleteDoc(wishlistRef);
      isWishlisted = false;
      wishlistBtn.textContent = "♡ Save";
      wishlistMessage.textContent = "Removed from wishlist.";
    } else {
      await setDoc(wishlistRef, {
        productId: currentItem.id,
        sellerId: currentItem.sellerId || "",
        title: currentItem.title || "",
        price: Number(currentItem.price || 0),
        imageUrl: currentItem.imageUrl || "",
        category: currentItem.category || "",
        type: currentItem.type || "",
        shopName: currentShop.shopName || "",
        addedAt: serverTimestamp()
      }, { merge: true });

      isWishlisted = true;
      wishlistBtn.textContent = "♥ Saved";
      wishlistMessage.textContent = "Saved to wishlist.";
    }
  } catch (error) {
    wishlistMessage.textContent = error.message;
  }

  wishlistBtn.disabled = false;
}

async function addToCart() {
  const cartMessage = document.getElementById("cartMessage");

  if (!currentUser) {
    cartMessage.textContent = "Please login first.";

    setTimeout(() => {
      window.location.href = "login.html";
    }, 800);

    return;
  }

  const qty = Number(document.getElementById("qtyInput").value || 1);

  if (qty < 1) {
    cartMessage.textContent = "Quantity must be at least 1.";
    return;
  }

  if (
    currentItem.type === "product" &&
    Number(currentItem.stock || 0) > 0 &&
    qty > Number(currentItem.stock || 0)
  ) {
    cartMessage.textContent = "Quantity is higher than available stock.";
    return;
  }

  await setDoc(doc(db, "carts", currentUser.uid, "items", currentItem.id), {
    productId: currentItem.id,
    sellerId: currentItem.sellerId,
    title: currentItem.title,
    type: currentItem.type,
    category: currentItem.category,
    price: Number(currentItem.price || 0),
    quantity: qty,
    imageUrl: currentItem.imageUrl || "",
    shopName: currentShop.shopName || "",
    addedAt: serverTimestamp()
  }, { merge: true });

  cartMessage.textContent = "Added to cart.";
}

function getAverageRating(reviews, fieldName) {
  if (!reviews || reviews.length === 0) return 0;

  const total = reviews.reduce((sum, review) => {
    return sum + Number(review[fieldName] || review.rating || 0);
  }, 0);

  return Number((total / reviews.length).toFixed(1));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
