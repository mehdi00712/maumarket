import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const COMMISSION_RATE = 0.10;

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const summaryItems = document.getElementById("summaryItems");
const productsTotal = document.getElementById("productsTotal");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadCart();
});

async function loadCart() {
  cartItems.innerHTML = "Loading cart...";

  const snapshot = await getDocs(
    collection(db, "carts", currentUser.uid, "items")
  );

  if (snapshot.empty) {
    renderEmptyCart();
    return;
  }

  let total = 0;
  let itemCount = 0;
  const sellerGroups = {};

  snapshot.forEach((docSnap) => {
    const cartItem = {
      id: docSnap.id,
      ...docSnap.data()
    };

    const sellerId = cartItem.sellerId || "unknown";
    const sellerName = cartItem.shopName || "Unknown Shop";

    if (!sellerGroups[sellerId]) {
      sellerGroups[sellerId] = {
        sellerId,
        sellerName,
        items: []
      };
    }

    sellerGroups[sellerId].items.push(cartItem);
  });

  cartItems.innerHTML = "";

  Object.values(sellerGroups).forEach((group) => {
    const sellerSection = document.createElement("section");
    sellerSection.className = "cart-seller-section";

    let sellerTotal = 0;

    sellerSection.innerHTML = `
      <div class="cart-seller-head">
        <div>
          <h2>${escapeHtml(group.sellerName)}</h2>
          <p>Verified MauMarket seller</p>
        </div>

        <span>Delivery by MauMarket</span>
      </div>

      <div class="cart-seller-items"></div>
    `;

    const sellerItemsBox = sellerSection.querySelector(".cart-seller-items");

    group.items.forEach((item) => {
      const quantity = Number(item.quantity || 1);
      const buyerPrice = getBuyerPrice(item);
      const sellerPrice = getSellerPrice(item);
      const commissionAmount = getCommissionAmount(item);
      const lineTotal = roundMoney(buyerPrice * quantity);

      sellerTotal += lineTotal;
      total += lineTotal;
      itemCount += quantity;

      const itemDiv = document.createElement("div");
      itemDiv.className = "cart-item pro-cart-item";

      itemDiv.innerHTML = `
        <div class="cart-item-img">
          ${
            item.imageUrl
              ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Product")}">`
              : `<div class="no-img">No Image</div>`
          }
        </div>

        <div class="cart-info">
          <span class="badge">${escapeHtml(item.type || "item")}</span>

          <h3>${escapeHtml(item.title || "Untitled")}</h3>

          <p class="muted">${escapeHtml(item.category || "")}</p>

          <div class="cart-price-box">
            <p>
              <strong>Buyer Price:</strong>
              ${formatRs(buyerPrice)}
            </p>

            <p class="buyer-price-note">
              MauMarket commission included
            </p>
          </div>

          <div class="cart-commission-mini">
            <span>Seller receives: ${formatRs(sellerPrice)}</span>
            <span>MauMarket 10%: ${formatRs(commissionAmount)}</span>
          </div>

          <div class="cart-qty-row">
            <label>Qty</label>

            <input
              class="qty-update"
              type="number"
              min="1"
              value="${quantity}">
          </div>

          <p class="cart-line-total">
            Subtotal:
            <strong>${formatRs(lineTotal)}</strong>
          </p>
        </div>

        <div class="cart-actions-side">
          <button class="danger-btn remove-btn" type="button">
            Remove
          </button>
        </div>
      `;

      itemDiv.querySelector(".qty-update").addEventListener("change", async (event) => {
        const newQty = Number(event.target.value || 1);

        if (newQty < 1) {
          event.target.value = quantity;
          return;
        }

        await updateDoc(doc(db, "carts", currentUser.uid, "items", item.id), {
          quantity: newQty
        });

        await loadCart();
      });

      itemDiv.querySelector(".remove-btn").addEventListener("click", async () => {
        if (!confirm("Remove this item from your cart?")) return;

        await deleteDoc(doc(db, "carts", currentUser.uid, "items", item.id));
        await loadCart();
      });

      sellerItemsBox.appendChild(itemDiv);
    });

    const footer = document.createElement("div");
    footer.className = "cart-seller-footer";
    footer.innerHTML = `
      <span>${group.items.length} item(s) from this seller</span>
      <strong>${formatRs(sellerTotal)}</strong>
    `;

    sellerSection.appendChild(footer);
    cartItems.appendChild(sellerSection);
  });

  renderSummary({
    itemCount,
    total
  });
}

function renderSummary({ itemCount, total }) {
  if (summaryItems) {
    summaryItems.textContent = String(itemCount);
  }

  if (productsTotal) {
    productsTotal.textContent = formatPlainNumber(total);
  }

  if (cartTotal) {
    cartTotal.textContent = formatPlainNumber(total);
  }
}

function renderEmptyCart() {
  cartItems.innerHTML = `
    <div class="empty-cart-card">
      <h2>Your cart is empty</h2>
      <p>Browse the marketplace and add products or services to your cart.</p>

      <a href="products.html" class="btn">
        Start Shopping
      </a>
    </div>
  `;

  if (summaryItems) summaryItems.textContent = "0";
  if (productsTotal) productsTotal.textContent = "0";
  if (cartTotal) cartTotal.textContent = "0";
}

async function refreshCartItemFromProduct(cartItem) {
  try {
    const productSnap = await getDoc(doc(db, "products", cartItem.productId));

    if (!productSnap.exists()) {
      return cartItem;
    }

    const product = {
      id: productSnap.id,
      ...productSnap.data()
    };

    return {
      ...cartItem,
      title: product.title || cartItem.title,
      type: product.type || cartItem.type,
      category: product.category || cartItem.category,
      imageUrl: product.imageUrl || cartItem.imageUrl,
      sellerId: product.sellerId || cartItem.sellerId,
      price: getBuyerPrice(product),
      buyerPrice: getBuyerPrice(product),
      sellerPrice: getSellerPrice(product),
      commissionAmount: getCommissionAmount(product),
      commissionRate: COMMISSION_RATE
    };
  } catch (error) {
    console.warn("Could not refresh cart item:", error.message);
    return cartItem;
  }
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

  const sellerPrice = getSellerPrice(item);
  const buyerPrice = getBuyerPrice(item);

  return roundMoney(Math.max(0, buyerPrice - sellerPrice));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatRs(value) {
  return `Rs ${formatPlainNumber(value)}`;
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
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
