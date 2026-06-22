import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const wishlistItems = document.getElementById("wishlistItems");
const wishlistSearchInput = document.getElementById("wishlistSearchInput");
const wishlistSearchBtn = document.getElementById("wishlistSearchBtn");

let currentUser = null;

wishlistSearchBtn?.addEventListener("click", runSearch);

wishlistSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
});

function runSearch() {
  const search = wishlistSearchInput?.value?.trim() || "";
  window.location.href = search
    ? `products.html?search=${encodeURIComponent(search)}`
    : "products.html";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadWishlist();
});

async function loadWishlist() {
  wishlistItems.innerHTML = `
    <div class="order-card">Loading wishlist...</div>
  `;

  try {
    const snapshot = await getDocs(
      collection(db, "wishlists", currentUser.uid, "items")
    );

    if (snapshot.empty) {
      wishlistItems.innerHTML = `
        <div class="order-card">
          <h3>Your wishlist is empty</h3>
          <p>Save products by pressing the heart button.</p>
          <a class="btn" href="products.html">Browse Marketplace</a>
        </div>
      `;
      return;
    }

    const items = [];

    for (const wishSnap of snapshot.docs) {
      const wish = wishSnap.data();
      const productId = wish.productId || wishSnap.id;

      const productSnap = await getDoc(doc(db, "products", productId));

      if (productSnap.exists()) {
        items.push({
          wishlistId: wishSnap.id,
          productId,
          ...productSnap.data()
        });
      }
    }

    renderWishlist(items);
  } catch (error) {
    wishlistItems.innerHTML = `
      <div class="order-card">
        <h3>Could not load wishlist</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderWishlist(items) {
  if (items.length === 0) {
    wishlistItems.innerHTML = `
      <div class="order-card">
        <h3>Your wishlist is empty</h3>
        <p>Saved products may have been removed or hidden.</p>
        <a class="btn" href="products.html">Browse Marketplace</a>
      </div>
    `;
    return;
  }

  wishlistItems.innerHTML = "";

  items.forEach((item) => {
    const rating = Number(item.averageRating || 0);
    const reviews = Number(item.totalReviews || 0);

    const card = document.createElement("div");
    card.className = "pro-product-card";

    card.innerHTML = `
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
        <p class="muted">${escapeHtml(item.category || "Other")}</p>

        <p class="rating-line-small">
          ${rating > 0 ? `⭐ ${rating.toFixed(1)} (${reviews})` : "⭐ No reviews yet"}
        </p>

        <p class="pro-price">Rs ${Number(item.price || 0)}</p>

        <div class="seller-actions">
          <a class="btn" href="product-details.html?id=${encodeURIComponent(item.productId)}">View</a>
          <button class="secondary-btn remove-wishlist-btn">Remove</button>
        </div>
      </div>
    `;

    card.querySelector(".remove-wishlist-btn").addEventListener("click", async () => {
      await deleteDoc(doc(db, "wishlists", currentUser.uid, "items", item.productId));
      await loadWishlist();
    });

    wishlistItems.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
