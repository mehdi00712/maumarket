import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================================================
   MAUMARKET CART.JS
   Supports:
   - Standard products
   - Products with options / variants
   - Option-specific price, stock, SKU and image
   - Separate cart rows for each selected option
   - Firestore cart badge updates
   ========================================================= */

const COMMISSION_RATE = 0.10;

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const summaryItems = document.getElementById("summaryItems");
const productsTotal = document.getElementById("productsTotal");

let currentUser = null;

/* =========================================================
   AUTHENTICATION
   ========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  /*
    MauMarket now stores the cart only in Firestore.
    Remove any old localStorage cart to avoid stale totals.
  */
  localStorage.removeItem("cart");

  await loadCart();
});

/* =========================================================
   LOAD CART
   ========================================================= */

async function loadCart() {
  if (!cartItems || !currentUser) return;

  cartItems.innerHTML = `
    <div class="cart-loading-card">
      Loading your cart...
    </div>
  `;

  try {
    const snapshot = await getDocs(
      collection(
        db,
        "carts",
        currentUser.uid,
        "items"
      )
    );

    if (snapshot.empty) {
      renderEmptyCart();
      updateCartBadge(0);
      return;
    }

    let total = 0;
    let itemCount = 0;

    const merchantGroups = {};

    snapshot.forEach((docSnap) => {
      const item = {
        id: docSnap.id,
        ...docSnap.data()
      };

      const merchantId =
        item.sellerId ||
        item.shopId ||
        "unknown";

      if (!merchantGroups[merchantId]) {
        merchantGroups[merchantId] = {
          id: merchantId,
          label: "Verified MauMarket Merchant",
          items: []
        };
      }

      merchantGroups[merchantId].items.push(item);
    });

    cartItems.innerHTML = "";

    Object.values(merchantGroups).forEach((group) => {
      const section = document.createElement("section");
      section.className = "cart-seller-section";

      let merchantTotal = 0;
      let merchantCount = 0;

      section.innerHTML = `
        <div class="cart-seller-head">
          <div>
            <h2>Verified MauMarket Merchant</h2>
            <p>Merchant identity is kept private</p>
          </div>

          <span>MauMarket Delivery</span>
        </div>

        <div class="cart-seller-items"></div>
      `;

      const holder = section.querySelector(".cart-seller-items");

      group.items.forEach((item) => {
        const quantity = Math.max(
          1,
          Number(item.quantity || 1)
        );

        const price = getBuyerPrice(item);
        const lineTotal = roundMoney(
          price * quantity
        );

        merchantTotal += lineTotal;
        merchantCount += quantity;

        total += lineTotal;
        itemCount += quantity;

        const card = createCartItemCard(
          item,
          quantity,
          price,
          lineTotal
        );

        holder.appendChild(card);
      });

      const footer = document.createElement("div");
      footer.className = "cart-seller-footer";

      footer.innerHTML = `
        <span>
          ${merchantCount} item${merchantCount === 1 ? "" : "s"}
        </span>

        <strong>
          ${formatRs(merchantTotal)}
        </strong>
      `;

      section.appendChild(footer);
      cartItems.appendChild(section);
    });

    renderSummary({
      itemCount,
      total
    });

    updateCartBadge(itemCount);
  } catch (error) {
    console.error("Could not load cart:", error);

    cartItems.innerHTML = `
      <div class="empty-cart-card">
        <h2>Could not load your cart</h2>

        <p>
          ${escapeHtml(
            getFriendlyCartError(
              error,
              "Please refresh the page and try again."
            )
          )}
        </p>

        <button
          id="retryCartBtn"
          type="button"
          class="btn">
          Try Again
        </button>
      </div>
    `;

    document
      .getElementById("retryCartBtn")
      ?.addEventListener("click", loadCart);
  }
}

/* =========================================================
   CART ITEM CARD
   ========================================================= */

function createCartItemCard(
  item,
  quantity,
  price,
  lineTotal
) {
  const card = document.createElement("article");
  card.className = "cart-item pro-cart-item";

  const hasOption =
    Boolean(
      item.selectedOptionId ||
      item.selectedOptionName ||
      item.optionId ||
      item.optionName
    );

  const optionType =
    item.optionType ||
    "Option";

  const optionName =
    item.selectedOptionName ||
    item.optionName ||
    "";

  const optionSku =
    item.selectedOptionSku ||
    item.optionSku ||
    item.sku ||
    "";

  const optionStock =
    getCartItemStock(item);

  const maxQuantity =
    optionStock > 0
      ? optionStock
      : "";

  const imageUrl =
    item.imageUrl ||
    item.selectedOptionImageUrl ||
    "";

  card.innerHTML = `
    <div class="cart-item-img">
      ${
        imageUrl
          ? `
            <img
              src="${escapeHtml(imageUrl)}"
              alt="${escapeHtml(item.title || "Product")}">
          `
          : `
            <div class="no-img">
              No Image
            </div>
          `
      }
    </div>

    <div class="cart-info">

      <div class="cart-product-meta-row">
        <span class="badge">
          ${escapeHtml(item.type || "item")}
        </span>

        ${
          hasOption
            ? `
              <span class="cart-option-badge">
                ${escapeHtml(optionName)}
              </span>
            `
            : ""
        }
      </div>

      <h3>
        ${escapeHtml(item.title || "Untitled")}
      </h3>

      <p class="muted">
        ${escapeHtml(item.category || "")}
      </p>

      <div class="merchant-anonymous-badge">
        ✓ Verified MauMarket Merchant
      </div>

      ${
        hasOption
          ? `
            <div class="cart-selected-option-card">

              <div>
                <span>
                  Selected ${escapeHtml(optionType)}
                </span>

                <strong>
                  ${escapeHtml(optionName || "Selected option")}
                </strong>
              </div>

              ${
                optionSku
                  ? `
                    <div>
                      <span>Product Code</span>

                      <strong>
                        ${escapeHtml(optionSku)}
                      </strong>
                    </div>
                  `
                  : ""
              }

            </div>
          `
          : ""
      }

      <div class="cart-price-box">

        <p>
          <strong>Unit Price:</strong>
          ${formatRs(price)}
        </p>

      </div>

      <div class="cart-qty-row">

        <label for="qty-${escapeHtml(item.id)}">
          Qty
        </label>

        <input
          id="qty-${escapeHtml(item.id)}"
          class="qty-update"
          type="number"
          min="1"
          ${maxQuantity ? `max="${maxQuantity}"` : ""}
          value="${quantity}">

        ${
          optionStock > 0
            ? `
              <small class="muted">
                ${optionStock} available
              </small>
            `
            : ""
        }

      </div>

      <p class="cart-line-total">
        Subtotal:
        <strong>
          ${formatRs(lineTotal)}
        </strong>
      </p>

      <p
        class="cart-item-message"
        aria-live="polite">
      </p>

    </div>

    <div class="cart-actions-side">

      <button
        class="danger-btn remove-btn"
        type="button">
        Remove
      </button>

    </div>
  `;

  const quantityInput =
    card.querySelector(".qty-update");

  const removeButton =
    card.querySelector(".remove-btn");

  const itemMessage =
    card.querySelector(".cart-item-message");

  quantityInput?.addEventListener(
    "change",
    async (event) => {
      const newQuantity = Math.floor(
        Number(event.target.value || 1)
      );

      if (
        !Number.isFinite(newQuantity) ||
        newQuantity < 1
      ) {
        event.target.value = quantity;

        setItemMessage(
          itemMessage,
          "Quantity must be at least 1.",
          "error"
        );

        return;
      }

      if (
        optionStock > 0 &&
        newQuantity > optionStock
      ) {
        event.target.value = quantity;

        setItemMessage(
          itemMessage,
          `Only ${optionStock} item${optionStock === 1 ? "" : "s"} are available.`,
          "error"
        );

        return;
      }

      quantityInput.disabled = true;

      setItemMessage(
        itemMessage,
        "Updating quantity...",
        "info"
      );

      try {
        await updateDoc(
          doc(
            db,
            "carts",
            currentUser.uid,
            "items",
            item.id
          ),
          {
            quantity: newQuantity,
            updatedAt: new Date()
          }
        );

        await loadCart();
      } catch (error) {
        quantityInput.disabled = false;
        event.target.value = quantity;

        setItemMessage(
          itemMessage,
          getFriendlyCartError(
            error,
            "The quantity could not be updated."
          ),
          "error"
        );
      }
    }
  );

  removeButton?.addEventListener(
    "click",
    async () => {
      const confirmed = window.confirm(
        hasOption
          ? `Remove ${optionName || "this option"} from your cart?`
          : "Remove this item from your cart?"
      );

      if (!confirmed) return;

      removeButton.disabled = true;
      removeButton.textContent = "Removing...";

      try {
        await deleteDoc(
          doc(
            db,
            "carts",
            currentUser.uid,
            "items",
            item.id
          )
        );

        await loadCart();
      } catch (error) {
        removeButton.disabled = false;
        removeButton.textContent = "Remove";

        setItemMessage(
          itemMessage,
          getFriendlyCartError(
            error,
            "The item could not be removed."
          ),
          "error"
        );
      }
    }
  );

  return card;
}

/* =========================================================
   SUMMARY
   ========================================================= */

function renderSummary({
  itemCount,
  total
}) {
  if (summaryItems) {
    summaryItems.textContent =
      String(itemCount);
  }

  if (productsTotal) {
    productsTotal.textContent =
      formatPlainNumber(total);
  }

  if (cartTotal) {
    cartTotal.textContent =
      formatPlainNumber(total);
  }
}

function renderEmptyCart() {
  if (!cartItems) return;

  cartItems.innerHTML = `
    <div class="empty-cart-card">

      <div class="empty-cart-icon">
        🛒
      </div>

      <h2>
        Your cart is empty
      </h2>

      <p>
        Browse MauMarket and discover products from verified merchants.
      </p>

      <a
        class="btn"
        href="products.html">
        Browse Products
      </a>

    </div>
  `;

  if (summaryItems) {
    summaryItems.textContent = "0";
  }

  if (productsTotal) {
    productsTotal.textContent = "0";
  }

  if (cartTotal) {
    cartTotal.textContent = "0";
  }
}

/* =========================================================
   CART BADGE
   ========================================================= */

function updateCartBadge(count) {
  window.dispatchEvent(
    new CustomEvent(
      "cart-updated",
      {
        detail: {
          count: Number(count || 0)
        }
      }
    )
  );
}

/* =========================================================
   PRICE / STOCK HELPERS
   ========================================================= */

function getBuyerPrice(item) {
  const buyerPrice =
    Number(item?.buyerPrice || 0);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice);
  }

  const price =
    Number(item?.price || 0);

  if (price > 0) {
    return roundMoney(price);
  }

  const sellerPrice =
    Number(item?.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(
      sellerPrice *
      (
        1 +
        Number(
          item?.commissionRate ??
          COMMISSION_RATE
        )
      )
    );
  }

  return 0;
}

function getCartItemStock(item) {
  const selectedOptionStock =
    Number(
      item?.selectedOptionStock ??
      item?.optionStock ??
      0
    );

  if (selectedOptionStock > 0) {
    return Math.floor(selectedOptionStock);
  }

  const stock =
    Number(item?.stock || 0);

  if (stock > 0) {
    return Math.floor(stock);
  }

  return 0;
}

/* =========================================================
   ERROR AND MESSAGE HELPERS
   ========================================================= */

function setItemMessage(
  element,
  message,
  type = ""
) {
  if (!element) return;

  element.textContent =
    message || "";

  element.classList.remove(
    "success",
    "error",
    "info",
    "cart-message-success",
    "cart-message-error",
    "cart-message-info"
  );

  if (!message || !type) return;

  element.classList.add(type);
  element.classList.add(
    `cart-message-${type}`
  );
}

function getFriendlyCartError(
  error,
  fallbackMessage
) {
  const code =
    String(error?.code || "");

  const messages = {
    "permission-denied":
      "You do not have permission to update this cart.",

    "unavailable":
      "MauMarket is temporarily unavailable. Please try again.",

    "failed-precondition":
      "The cart could not be updated. Please refresh and try again.",

    "resource-exhausted":
      "The service is temporarily busy. Please try again.",

    "auth/network-request-failed":
      "Please check your internet connection and try again.",

    "network-request-failed":
      "Please check your internet connection and try again."
  };

  return (
    messages[code] ||
    fallbackMessage
  );
}

/* =========================================================
   FORMATTING HELPERS
   ========================================================= */

function roundMoney(value) {
  return (
    Math.round(
      Number(value || 0) * 100
    ) / 100
  );
}

function formatRs(value) {
  return `Rs ${formatPlainNumber(value)}`;
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
