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
   - Size + Colour product variants
   - Variant-specific price, stock, product code and image
   - Separate cart rows for each Size + Colour combination
   - Firestore cart badge updates
   - Backward compatibility with older flat product options
   ========================================================= */

const COMMISSION_RATE = 0.10;

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const summaryItems = document.getElementById("summaryItems");
const productsTotal = document.getElementById("productsTotal");
const cartPageMessage = document.getElementById("cartPageMessage");
const emptyCartState = document.getElementById("emptyCartState");
const checkoutBtn = document.getElementById("checkoutBtn");
const checkoutValidationMessage = document.getElementById("checkoutValidationMessage");
const cartOptionsNotice = document.getElementById("cartOptionsNotice");

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

  hideEmptyCartState();

  updateCheckoutState({
    canCheckout: false,
    message: "Your cart is loading."
  });

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

  setCartBusy(true);
  hideCartPageMessage();
  hideEmptyCartState();

  cartItems.innerHTML = `
    <div class="cart-loading-card">
      <strong>Loading your cart...</strong>
      <p>MauMarket is retrieving your selected products, sizes and colours.</p>
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
    let hasInvalidItems = false;

    const merchantGroups = {};

    snapshot.forEach((docSnap) => {
      const item = normalizeCartItem({
        id: docSnap.id,
        ...docSnap.data()
      });

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

      const holder =
        section.querySelector(".cart-seller-items");

      group.items.forEach((item) => {
        const quantity = Math.max(
          1,
          Math.floor(Number(item.quantity || 1))
        );

        const price = getBuyerPrice(item);
        const lineTotal = roundMoney(
          price * quantity
        );

        const stock = getCartItemStock(item);
        const isProduct =
          String(item.type || "product").toLowerCase() === "product";

        const invalid =
          price <= 0 ||
          (
            isProduct &&
            (
              stock <= 0 ||
              quantity > stock
            )
          ) ||
          (
            item.hasOptions &&
            !item.optionId &&
            !item.selectedOptionId
          );

        if (invalid) {
          hasInvalidItems = true;
        }

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

        holder?.appendChild(card);
      });

      const footer = document.createElement("div");
      footer.className = "cart-seller-footer";

      footer.innerHTML = `
        <span>
          ${merchantCount}
          item${merchantCount === 1 ? "" : "s"}
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

    updateCheckoutState({
      canCheckout: itemCount > 0 && !hasInvalidItems,
      message: hasInvalidItems
        ? "Review unavailable, out-of-stock or incomplete size and colour selections before checkout."
        : ""
    });

    updateCartBadge(itemCount);

    if (cartOptionsNotice) {
      cartOptionsNotice.hidden = false;
    }
  } catch (error) {
    console.error("Could not load cart:", error);

    const message = getFriendlyCartError(
      error,
      "Please refresh the page and try again."
    );

    showCartPageMessage(message, "error");

    cartItems.innerHTML = `
      <div class="empty-cart-card">
        <h2>Could not load your cart</h2>

        <p>
          ${escapeHtml(message)}
        </p>

        <button
          id="retryCartBtn"
          type="button"
          class="btn"
        >
          Try Again
        </button>
      </div>
    `;

    document
      .getElementById("retryCartBtn")
      ?.addEventListener("click", loadCart);

    updateCheckoutState({
      canCheckout: false,
      message: "Your cart must load successfully before checkout."
    });
  } finally {
    setCartBusy(false);
  }
}

function createCartItemCard(
  item,
  quantity,
  price,
  lineTotal
) {
  const card = document.createElement("article");
  card.className = "cart-item pro-cart-item";

  card.dataset.cartItemId = item.id || "";
  card.dataset.productId = item.productId || "";
  card.dataset.optionId =
    item.optionId ||
    item.selectedOptionId ||
    "";

  const hasOption = Boolean(
    item.optionId ||
    item.selectedOptionId ||
    item.optionName ||
    item.selectedOptionName ||
    item.optionDisplayValue ||
    item.selectedOptionDisplayValue ||
    item.selectedSize ||
    item.selectedColour
  );

  const selectedSize =
    item.selectedSize ||
    item.selectedSizeName ||
    buildOptionDisplayValue(
      item.selectedSizeValue ||
      item.optionValue ||
      item.selectedOptionValue ||
      "",
      item.selectedSizeUnit ||
      item.optionUnit ||
      item.selectedOptionUnit ||
      ""
    );

  const selectedColour =
    item.selectedColour ||
    item.selectedColourName ||
    item.colourName ||
    item.colorName ||
    "";

  const selectedColourCode =
    item.selectedColourCode ||
    item.colourCode ||
    item.colorCode ||
    "";

  const optionDisplayValue =
    item.optionDisplayValue ||
    item.selectedOptionDisplayValue ||
    (
      selectedSize && selectedColour
        ? `${selectedSize} / ${selectedColour}`
        : selectedSize || selectedColour
    ) ||
    item.optionName ||
    item.selectedOptionName ||
    "";

  const optionSku =
    item.productCode ||
    item.selectedOptionSku ||
    item.optionSku ||
    item.sku ||
    "";

  const optionStock = getCartItemStock(item);

  const isProduct =
    String(item.type || "product").toLowerCase() === "product";

  const maxQuantity =
    isProduct && optionStock > 0
      ? optionStock
      : "";

  const imageUrl =
    item.selectedOptionImageUrl ||
    item.selectedOptionImage ||
    item.optionImageUrl ||
    item.optionImage ||
    item.imageUrl ||
    "";

  const isUnavailable =
    isProduct && optionStock <= 0;

  const quantityTooHigh =
    isProduct &&
    optionStock > 0 &&
    quantity > optionStock;

  card.classList.toggle(
    "cart-item-invalid",
    isUnavailable || quantityTooHigh
  );

  const colourSwatch =
    /^#[0-9a-f]{6}$/i.test(selectedColourCode)
      ? `
          <span
            class="cart-colour-swatch"
            style="background:${escapeHtml(selectedColourCode)}"
            aria-hidden="true"
          ></span>
        `
      : "";

  card.innerHTML = `
    <div class="cart-item-img">
      ${
        imageUrl
          ? `
              <img
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(item.title || "Product")}"
              >
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
                  ${escapeHtml(optionDisplayValue || "Selected variant")}
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
              <div class="cart-selected-option-card cart-size-colour-card">

                <div class="cart-variant-summary">
                  <span>Selected Variant</span>
                  <strong>
                    ${escapeHtml(optionDisplayValue || "Selected variant")}
                  </strong>
                </div>

                ${
                  selectedSize
                    ? `
                        <div class="cart-item-size">
                          <span>Size</span>
                          <strong>${escapeHtml(selectedSize)}</strong>
                        </div>
                      `
                    : ""
                }

                ${
                  selectedColour
                    ? `
                        <div class="cart-item-colour">
                          <span>Colour</span>
                          <strong class="cart-colour-value">
                            ${colourSwatch}
                            ${escapeHtml(selectedColour)}
                          </strong>
                        </div>
                      `
                    : ""
                }

                ${
                  optionSku
                    ? `
                        <div class="cart-item-product-code">
                          <span>Product Code</span>
                          <strong>${escapeHtml(optionSku)}</strong>
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
          value="${quantity}"
          ${isUnavailable ? "disabled" : ""}
          inputmode="numeric"
        >

        ${
          isProduct
            ? `
                <small
                  class="cart-item-stock-message
                  ${isUnavailable ? "error" : "muted"}"
                >
                  ${
                    isUnavailable
                      ? "This size and colour combination is out of stock"
                      : `${optionStock} available`
                  }
                </small>
              `
            : ""
        }

      </div>

      ${
        quantityTooHigh
          ? `
              <p class="cart-item-message error">
                Only ${optionStock}
                item${optionStock === 1 ? "" : "s"}
                are available for this size and colour.
              </p>
            `
          : ""
      }

      <p class="cart-line-total">
        Subtotal:
        <strong>
          ${formatRs(lineTotal)}
        </strong>
      </p>

      <p
        class="cart-item-message"
        aria-live="polite"
      ></p>

    </div>

    <div class="cart-actions-side">
      <button
        class="danger-btn remove-btn"
        type="button"
      >
        Remove
      </button>
    </div>
  `;

  const quantityInput =
    card.querySelector(".qty-update");

  const removeButton =
    card.querySelector(".remove-btn");

  const itemMessages =
    card.querySelectorAll(".cart-item-message");

  const itemMessage =
    itemMessages[itemMessages.length - 1] || null;

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
        isProduct &&
        optionStock <= 0
      ) {
        event.target.value = quantity;

        setItemMessage(
          itemMessage,
          "This size and colour combination is currently out of stock.",
          "error"
        );

        return;
      }

      if (
        isProduct &&
        optionStock > 0 &&
        newQuantity > optionStock
      ) {
        event.target.value = quantity;

        setItemMessage(
          itemMessage,
          `Only ${optionStock} item${
            optionStock === 1 ? "" : "s"
          } are available for ${
            optionDisplayValue ||
            "this size and colour"
          }.`,
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
      const description =
        optionDisplayValue ||
        "this item";

      const confirmed = window.confirm(
        hasOption
          ? `Remove ${description} from your cart?`
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

  cartItems.innerHTML = "";

  showEmptyCartState();

  if (summaryItems) {
    summaryItems.textContent = "0";
  }

  if (productsTotal) {
    productsTotal.textContent = "0";
  }

  if (cartTotal) {
    cartTotal.textContent = "0";
  }

  if (cartOptionsNotice) {
    cartOptionsNotice.hidden = true;
  }

  updateCheckoutState({
    canCheckout: false,
    message: "Add at least one product before proceeding to checkout."
  });
}

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

function normalizeCartItem(item) {
  const selectedSizeValue = String(
    item?.selectedSizeValue ??
    item?.sizeValue ??
    item?.optionValue ??
    item?.selectedOptionValue ??
    item?.measurementValue ??
    ""
  ).trim();

  const selectedSizeUnit = String(
    item?.selectedSizeUnit ??
    item?.sizeUnit ??
    item?.optionUnit ??
    item?.selectedOptionUnit ??
    item?.measurementUnit ??
    ""
  ).trim();

  const selectedSize =
    String(
      item?.selectedSize ??
      item?.selectedSizeName ??
      ""
    ).trim() ||
    buildOptionDisplayValue(
      selectedSizeValue,
      selectedSizeUnit
    );

  const selectedColour = String(
    item?.selectedColour ??
    item?.selectedColourName ??
    item?.colourName ??
    item?.colorName ??
    ""
  ).trim();

  const selectedColourCode = String(
    item?.selectedColourCode ??
    item?.colourCode ??
    item?.colorCode ??
    ""
  ).trim();

  const optionDisplayValue =
    String(
      item?.optionDisplayValue ??
      item?.selectedOptionDisplayValue ??
      ""
    ).trim() ||
    (
      selectedSize && selectedColour
        ? `${selectedSize} / ${selectedColour}`
        : selectedSize || selectedColour
    ) ||
    String(
      item?.optionName ??
      item?.selectedOptionName ??
      ""
    ).trim();

  const optionId =
    item?.optionId ||
    item?.selectedOptionId ||
    "";

  const optionName =
    item?.optionName ||
    item?.selectedOptionName ||
    optionDisplayValue ||
    "";

  const productCode =
    item?.productCode ||
    item?.selectedOptionSku ||
    item?.optionSku ||
    item?.sku ||
    "";

  const hasOptions = Boolean(
    item?.hasOptions ||
    optionId ||
    optionName ||
    optionDisplayValue ||
    selectedSize ||
    selectedColour
  );

  return {
    ...item,

    optionId,
    optionName,
    optionValue: selectedSizeValue,
    optionUnit: selectedSizeUnit,
    optionDisplayValue,

    selectedSize,
    selectedSizeName:
      item?.selectedSizeName ||
      selectedSize,

    selectedSizeValue,
    selectedSizeUnit,

    selectedColour,
    selectedColourName:
      item?.selectedColourName ||
      selectedColour,

    selectedColourCode,

    optionStock:
      item?.optionStock ??
      item?.selectedOptionStock ??
      item?.stock ??
      0,

    selectedOptionId:
      item?.selectedOptionId || optionId,

    selectedOptionName:
      item?.selectedOptionName ||
      optionName,

    selectedOptionValue:
      item?.selectedOptionValue ||
      selectedSizeValue,

    selectedOptionUnit:
      item?.selectedOptionUnit ||
      selectedSizeUnit,

    selectedOptionDisplayValue:
      item?.selectedOptionDisplayValue ||
      optionDisplayValue,

    selectedOptionSku:
      item?.selectedOptionSku ||
      productCode,

    productCode,
    sku: item?.sku || productCode,

    optionType:
      item?.optionType ||
      (
        selectedSize || selectedColour
          ? "Size / Colour"
          : "Option"
      ),

    variantStructure:
      item?.variantStructure ||
      (
        selectedSize || selectedColour
          ? "size-colour"
          : ""
      ),

    hasOptions
  };
}

function buildOptionDisplayValue(value, unit) {
  const cleanValue = String(value || "").trim();
  const cleanUnit = String(unit || "").trim();

  if (!cleanValue) return "";
  if (!cleanUnit) return cleanValue;

  const labels = {
    mm: "mm",
    cm: "cm",
    m: "m",
    in: "in",
    ft: "ft",
    ml: "ml",
    l: "L",
    g: "g",
    kg: "kg",
    piece: "piece",
    pack: "pack",
    set: "set",
    pair: "pair"
  };

  const unitLabel =
    labels[cleanUnit.toLowerCase()] ||
    cleanUnit;

  return `${cleanValue} ${unitLabel}`;
}

function setCartBusy(isBusy) {
  cartItems?.setAttribute(
    "aria-busy",
    isBusy ? "true" : "false"
  );
}

function showCartPageMessage(
  message,
  type = ""
) {
  if (!cartPageMessage) return;

  cartPageMessage.textContent =
    message || "";

  cartPageMessage.hidden = !message;

  cartPageMessage.classList.remove(
    "success",
    "error",
    "info",
    "cart-message-success",
    "cart-message-error",
    "cart-message-info"
  );

  if (message && type) {
    cartPageMessage.classList.add(type);
    cartPageMessage.classList.add(
      `cart-message-${type}`
    );
  }
}

function hideCartPageMessage() {
  showCartPageMessage("");
}

function showEmptyCartState() {
  if (emptyCartState) {
    emptyCartState.hidden = false;
  }
}

function hideEmptyCartState() {
  if (emptyCartState) {
    emptyCartState.hidden = true;
  }
}

function updateCheckoutState({
  canCheckout,
  message = ""
}) {
  if (checkoutBtn) {
    checkoutBtn.setAttribute(
      "aria-disabled",
      canCheckout ? "false" : "true"
    );

    checkoutBtn.classList.toggle(
      "disabled",
      !canCheckout
    );

    checkoutBtn.tabIndex =
      canCheckout ? 0 : -1;

    checkoutBtn.onclick = canCheckout
      ? null
      : (event) => {
          event.preventDefault();

          showCartPageMessage(
            message ||
            "Your cart is not ready for checkout.",
            "error"
          );
        };
  }

  if (checkoutValidationMessage) {
    checkoutValidationMessage.textContent =
      message || "";
  }
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
  const hasOptionStock =
    item?.selectedOptionStock !== undefined ||
    item?.optionStock !== undefined;

  if (hasOptionStock) {
    return Math.max(
      0,
      Math.floor(
        Number(
          item?.selectedOptionStock ??
          item?.optionStock ??
          0
        )
      )
    );
  }

  if (item?.stock !== undefined) {
    return Math.max(
      0,
      Math.floor(Number(item.stock || 0))
    );
  }

  return 0;
}

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
