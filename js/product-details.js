import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
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
let shopReviews = [];

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

  currentShop = { shopName: "Unknown Shop" };

  if (currentItem.sellerId) {
    const shopSnap = await getDoc(doc(db, "shops", currentItem.sellerId));
    if (shopSnap.exists()) currentShop = shopSnap.data();
  }

  await loadShopReviews();
  renderDetails();
  await loadRelatedItems();
}

async function loadShopReviews() {
  const q = query(
    collection(db, "reviews"),
    where("sellerIds", "array-contains", currentItem.sellerId)
  );

  const snapshot = await getDocs(q);

  shopReviews = [];

  snapshot.forEach((docSnap) => {
    shopReviews.push(docSnap.data());
  });
}

function renderDetails() {
  const rating = getAverageRating();

  detailsBox.innerHTML = `
    <section class="pro-product-details">
      <div class="pro-gallery">
        ${
          currentItem.imageUrl
            ? `<img class="main-product-img" src="${currentItem.imageUrl}" alt="${currentItem.title}">`
            : `<div class="main-product-img no-img">No Image</div>`
        }
      </div>

      <div class="pro-product-info">
        <span class="badge">${currentItem.type || "item"}</span>
        <h1>${currentItem.title || "Untitled"}</h1>

        <p class="muted">${currentItem.category || "Other"}</p>
        <p class="rating-line">${rating} ⭐ (${shopReviews.length} shop reviews)</p>

        <h2 class="product-price">Rs ${Number(currentItem.price || 0)}</h2>

        <p>${currentItem.description || "No description provided."}</p>

        ${
          currentItem.type === "product"
            ? `<p><strong>Stock:</strong> ${Number(currentItem.stock || 0)}</p>`
            : `<p><strong>Service Area:</strong> ${currentItem.serviceArea || "Not specified"}</p>`
        }

        <div class="cart-actions">
          <input id="qtyInput" type="number" min="1" value="1">
          <button id="addToCartBtn">Add to Cart</button>
        </div>

        <p id="cartMessage"></p>
      </div>

      <aside class="buy-box">
        <h3>Seller</h3>
        <div class="mini-shop">
          ${currentShop.logoUrl ? `<img src="${currentShop.logoUrl}" alt="${currentShop.shopName}">` : ""}
          <div>
            <strong>${currentShop.shopName || "Shop"}</strong>
            <p>${rating} ⭐</p>
          </div>
        </div>

        <p>📍 ${currentShop.location || "Mauritius"}</p>
        <p>☎ ${currentShop.phone || "Not specified"}</p>
        <p>🚚 Delivery by MauMarket</p>

        <a class="btn" href="shop.html?id=${currentItem.sellerId}">Visit Shop</a>
      </aside>
    </section>
  `;

  document.getElementById("addToCartBtn").addEventListener("click", addToCart);
}

async function loadRelatedItems() {
  if (!currentItem.category) return;

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
    const div = document.createElement("div");
    div.className = "pro-product-card";

    div.innerHTML = `
      <div class="pro-product-img">
        ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : `<div class="no-img">No Image</div>`}
      </div>

      <div class="pro-product-body">
        <span class="badge">${item.type || "item"}</span>
        <h3>${item.title || "Untitled"}</h3>
        <p class="muted">${item.category || ""}</p>
        <p class="pro-price">Rs ${Number(item.price || 0)}</p>
        <a class="btn" href="product-details.html?id=${item.id}">View Details</a>
      </div>
    `;

    relatedItems.appendChild(div);
  });
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

  if (currentItem.type === "product" && currentItem.stock > 0 && qty > currentItem.stock) {
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

function getAverageRating() {
  if (shopReviews.length === 0) return "0.0";

  const total = shopReviews.reduce((sum, review) => {
    return sum + Number(review.sellerRating || 0);
  }, 0);

  return (total / shopReviews.length).toFixed(1);
}
