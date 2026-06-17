import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const detailsBox = document.getElementById("detailsBox");
const params = new URLSearchParams(window.location.search);
const itemId = params.get("id");

let currentUser = null;
let currentItem = null;
let currentShop = null;

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

  detailsBox.innerHTML = `
    <div class="details-grid">
      <div>
        ${currentItem.imageUrl ? `<img class="details-img" src="${currentItem.imageUrl}" alt="${currentItem.title}">` : ""}
      </div>

      <div>
        <span class="badge">${currentItem.type}</span>
        <h1>${currentItem.title}</h1>
        <p class="muted">${currentItem.category}</p>
        <h2>Rs ${currentItem.price}</h2>
        <p>${currentItem.description || ""}</p>

        ${currentItem.type === "product" ? `<p><strong>Stock:</strong> ${currentItem.stock}</p>` : ""}
        ${currentItem.type === "service" ? `<p><strong>Service Area:</strong> ${currentItem.serviceArea || "Not specified"}</p>` : ""}

        <div class="cart-actions">
          <input id="qtyInput" type="number" min="1" value="1">
          <button id="addToCartBtn">Add to Cart</button>
        </div>

        <p id="cartMessage"></p>

        <hr>

        <h3>${currentShop.shopName}</h3>
        <p>${currentShop.description || ""}</p>
        <p><strong>Location:</strong> ${currentShop.location || "Not specified"}</p>
        <p><strong>Phone:</strong> ${currentShop.phone || "Not specified"}</p>

        <a class="btn" href="shop.html?id=${currentItem.sellerId}">View Seller Shop</a>
      </div>
    </div>
  `;

  document.getElementById("addToCartBtn").addEventListener("click", addToCart);
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

  if (!currentItem || currentItem.active !== true) {
    cartMessage.textContent = "This item is not available.";
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
