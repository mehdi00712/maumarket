/**
 * MauMarket Seller Orders
 * Updated for Size + Colour variants and seller-query diagnostics.
 *
 * Supports:
 * - Legacy single sellerId orders
 * - New sellerIds array orders
 * - Size + Colour variant display
 * - Variant image, product code, stock and pricing
 * - Seller earnings and commission calculations
 * - Seller preparation workflow
 */

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================================================
   MAUMARKET SELLER ORDERS
   Supports:
   - Standard products
   - Products with options / variants
   - Option-specific name, value, unit, display value, SKU, image, price and stock
   - Seller earnings and commission calculations
   - Seller preparation workflow
   ========================================================= */

const COMMISSION_RATE = 0.10;

const sellerOrdersList =
  document.getElementById("sellerOrdersList");

const sellerOrdersMenuBtn =
  document.getElementById("sellerOrdersMenuBtn");

const sellerOrdersNav =
  document.getElementById("sellerOrdersNav");

const sellerTotalOrders =
  document.getElementById("sellerTotalOrders");

const sellerTotalEarnings =
  document.getElementById("sellerTotalEarnings");

const sellerTotalCommission =
  document.getElementById("sellerTotalCommission");

const sellerOrdersCountText =
  document.getElementById("sellerOrdersCountText");

const sellerOrderSearch =
  document.getElementById("sellerOrderSearch");

const sellerOrderStatusFilter =
  document.getElementById("sellerOrderStatusFilter");

const refreshSellerOrdersBtn =
  document.getElementById("refreshSellerOrdersBtn");

const sellerOrdersPageMessage =
  document.getElementById("sellerOrdersPageMessage");

const sellerOptionItems =
  document.getElementById("sellerOptionItems");

let currentUser = null;
let currentSellerData = null;
let allSellerOrders = [];

let sellerOrderQueryState = {
  direct: {
    status: "idle",
    count: 0,
    error: null
  },
  array: {
    status: "idle",
    count: 0,
    error: null
  }
};

/* =========================================================
   MOBILE MENU
   ========================================================= */

sellerOrdersMenuBtn?.addEventListener("click", () => {
  sellerOrdersNav?.classList.toggle("show");
});

sellerOrderSearch?.addEventListener(
  "input",
  renderFilteredSellerOrders
);

sellerOrderStatusFilter?.addEventListener(
  "change",
  renderFilteredSellerOrders
);

refreshSellerOrdersBtn?.addEventListener(
  "click",
  loadSellerOrders
);


/* =========================================================
   AUTHENTICATION
   ========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const userSnap = await getDoc(
      doc(db, "users", user.uid)
    );

    if (
      !userSnap.exists() ||
      userSnap.data().role !== "seller" ||
      userSnap.data().approved !== true ||
      userSnap.data().blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    currentSellerData = userSnap.data();

    await loadSellerOrders();
  } catch (error) {
    console.error(
      "Could not verify seller account:",
      error
    );

    window.location.href = "dashboard.html";
  }
});

/* =========================================================
   LOAD SELLER ORDERS
   ========================================================= */

async function loadSellerOrders() {
  if (!sellerOrdersList || !currentUser) return;

  sellerOrdersList.setAttribute(
    "aria-busy",
    "true"
  );

  hideSellerOrdersPageMessage();

  sellerOrdersList.innerHTML = `
    <div class="seller-orders-loading-state">
      <div
        class="seller-orders-loading-spinner"
        aria-hidden="true">
      </div>

      <div>
        <strong>
          Loading merchant orders...
        </strong>

        <p>
          MauMarket is retrieving your orders and selected
          Size + Colour variants.
        </p>
      </div>
    </div>
  `;

  if (refreshSellerOrdersBtn) {
    refreshSellerOrdersBtn.disabled = true;
    refreshSellerOrdersBtn.textContent =
      "Refreshing...";
  }

  sellerOrderQueryState = {
    direct: {
      status: "loading",
      count: 0,
      error: null
    },
    array: {
      status: "loading",
      count: 0,
      error: null
    }
  };

  try {
    /*
      MauMarket has used two top-level seller ownership formats:

      1. sellerId: "uid"
      2. sellerIds: ["uid"]

      Each query is executed independently so a denied legacy query cannot
      hide results returned by the valid query.
    */
    const directSellerQuery = query(
      collection(db, "orders"),
      where(
        "sellerId",
        "==",
        currentUser.uid
      )
    );

    const sellerArrayQuery = query(
      collection(db, "orders"),
      where(
        "sellerIds",
        "array-contains",
        currentUser.uid
      )
    );

    const [
      directResult,
      arrayResult
    ] = await Promise.allSettled([
      getDocs(directSellerQuery),
      getDocs(sellerArrayQuery)
    ]);

    const ordersById = new Map();

    if (directResult.status === "fulfilled") {
      sellerOrderQueryState.direct = {
        status: "fulfilled",
        count: directResult.value.size,
        error: null
      };

      directResult.value.docs.forEach(
        (docSnap) => {
          ordersById.set(docSnap.id, {
            id: docSnap.id,
            ...docSnap.data()
          });
        }
      );

      console.info(
        "sellerId order query succeeded:",
        directResult.value.size,
        "order(s)"
      );
    } else {
      sellerOrderQueryState.direct = {
        status: "rejected",
        count: 0,
        error: directResult.reason
      };

      console.error(
        "sellerId order query failed:",
        directResult.reason
      );
    }

    if (arrayResult.status === "fulfilled") {
      sellerOrderQueryState.array = {
        status: "fulfilled",
        count: arrayResult.value.size,
        error: null
      };

      arrayResult.value.docs.forEach(
        (docSnap) => {
          ordersById.set(docSnap.id, {
            id: docSnap.id,
            ...docSnap.data()
          });
        }
      );

      console.info(
        "sellerIds array order query succeeded:",
        arrayResult.value.size,
        "order(s)"
      );
    } else {
      sellerOrderQueryState.array = {
        status: "rejected",
        count: 0,
        error: arrayResult.reason
      };

      console.error(
        "sellerIds array order query failed:",
        arrayResult.reason
      );
    }

    const bothQueriesFailed =
      directResult.status === "rejected" &&
      arrayResult.status === "rejected";

    if (bothQueriesFailed) {
      const directMessage =
        getFriendlySellerOrderError(
          directResult.reason,
          "The sellerId order query was denied."
        );

      const arrayMessage =
        getFriendlySellerOrderError(
          arrayResult.reason,
          "The sellerIds order query was denied."
        );

      throw new Error(
        `${directMessage} ${arrayMessage}`
      );
    }

    allSellerOrders =
      Array.from(ordersById.values())
        .filter((order) =>
          orderBelongsToCurrentSeller(order)
        )
        .sort((a, b) => {
          return (
            getTimestampMilliseconds(
              b.createdAt
            ) -
            getTimestampMilliseconds(
              a.createdAt
            )
          );
        });

    showPartialQueryWarning();
    renderFilteredSellerOrders();
  } catch (error) {
    console.error(
      "Could not load seller orders:",
      error
    );

    const message =
      error?.message ||
      getFriendlySellerOrderError(
        error,
        "Please refresh the page and try again."
      );

    showSellerOrdersPageMessage(
      message,
      "error"
    );

    sellerOrdersList.innerHTML = `
      <div class="order-card">
        <h3>
          Could not load seller orders
        </h3>

        <p>
          ${escapeHtml(message)}
        </p>

        <button
          id="retrySellerOrdersBtn"
          type="button"
          class="btn">
          Try Again
        </button>
      </div>
    `;

    document
      .getElementById(
        "retrySellerOrdersBtn"
      )
      ?.addEventListener(
        "click",
        loadSellerOrders
      );
  } finally {
    sellerOrdersList.setAttribute(
      "aria-busy",
      "false"
    );

    if (refreshSellerOrdersBtn) {
      refreshSellerOrdersBtn.disabled = false;
      refreshSellerOrdersBtn.textContent =
        "Refresh";
    }
  }
}

function showPartialQueryWarning() {
  const directFailed =
    sellerOrderQueryState.direct.status ===
    "rejected";

  const arrayFailed =
    sellerOrderQueryState.array.status ===
    "rejected";

  if (!directFailed && !arrayFailed) {
    hideSellerOrdersPageMessage();
    return;
  }

  if (directFailed) {
    showSellerOrdersPageMessage(
      "Some legacy orders could not be checked because the sellerId query was denied. Orders stored with sellerIds are still shown.",
      "info"
    );
    return;
  }

  if (arrayFailed) {
    showSellerOrdersPageMessage(
      "Some multi-seller orders could not be checked because the sellerIds query was denied. Orders stored with sellerId are still shown.",
      "info"
    );
  }
}

function getTimestampMilliseconds(value) {
  if (!value) return 0;

  if (
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (
    Number.isFinite(value.seconds)
  ) {
    return value.seconds * 1000;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function renderFilteredSellerOrders() {
  if (!sellerOrdersList || !currentUser) return;

  const search = normalizeText(
    sellerOrderSearch?.value || ""
  );

  const selectedStatus = String(
    sellerOrderStatusFilter?.value || ""
  ).trim();

  const filteredOrders = allSellerOrders.filter(
    (order) => {
      const sellerItems = getSellerItems(order);

      const searchableText = normalizeText(`
        ${order.id || ""}
        ${order.orderNumber || ""}
        ${order.customerName || ""}
        ${order.customerPhone || ""}
        ${order.deliveryAddress || ""}
        ${order.orderStatus || ""}
        ${sellerItems.map((item) => `
          ${item.title || ""}
          ${item.category || ""}
          ${item.selectedOptionName || item.optionName || ""}
          ${item.selectedOptionValue || item.optionValue || ""}
          ${item.selectedOptionUnit || item.optionUnit || ""}
          ${item.selectedOptionDisplayValue || item.optionDisplayValue || ""}
          ${item.selectedSize || item.selectedSizeName || item.sizeName || ""}
          ${item.selectedSizeValue || item.sizeValue || ""}
          ${item.selectedSizeUnit || item.sizeUnit || ""}
          ${item.selectedColour || item.selectedColourName || item.colourName || item.colorName || ""}
          ${item.selectedColourCode || item.colourCode || item.colorCode || ""}
          ${item.selectedOptionSku || item.optionSku || item.productCode || item.sku || ""}
        `).join(" ")}
      `);

      const matchesSearch =
        !search ||
        searchableText.includes(search);

      const matchesStatus =
        !selectedStatus ||
        String(order.orderStatus || "") === selectedStatus;

      return matchesSearch && matchesStatus;
    }
  );

  renderSellerOrderCollection(filteredOrders);
}

function renderSellerOrderCollection(orders) {
  sellerOrdersList.innerHTML = "";

  if (allSellerOrders.length === 0) {
    renderStats(0, 0, 0, 0);

    if (sellerOrdersCountText) {
      sellerOrdersCountText.textContent = "0 orders";
    }

    const deniedQueryText =
      sellerOrderQueryState.direct.status === "rejected" ||
      sellerOrderQueryState.array.status === "rejected"
        ? `
            <p class="muted">
              One compatibility query was denied, so some older or
              multi-seller orders may not be visible yet. Check the
              console to see whether sellerId or sellerIds failed.
            </p>
          `
        : "";

    sellerOrdersList.innerHTML = `
      <div class="order-card">
        <h3>No accessible orders found</h3>

        <p>
          No order returned by the seller ownership queries contains
          your current Firebase seller UID.
        </p>

        ${deniedQueryText}
      </div>
    `;

    return;
  }

  if (orders.length === 0) {
    renderStats(0, 0, 0, 0);

    if (sellerOrdersCountText) {
      sellerOrdersCountText.textContent = "0 matching orders";
    }

    sellerOrdersList.innerHTML = `
      <div class="order-card">
        <h3>No matching orders</h3>

        <p>
          Try changing the search text or fulfilment status.
        </p>

        <button
          id="clearSellerOrderFiltersBtn"
          type="button"
          class="secondary-btn"
        >
          Clear Filters
        </button>
      </div>
    `;

    document
      .getElementById("clearSellerOrderFiltersBtn")
      ?.addEventListener("click", () => {
        if (sellerOrderSearch) {
          sellerOrderSearch.value = "";
        }

        if (sellerOrderStatusFilter) {
          sellerOrderStatusFilter.value = "";
        }

        renderFilteredSellerOrders();
      });

    return;
  }

  let visibleOrderCount = 0;
  let totalSellerEarnings = 0;
  let totalCommission = 0;
  let optionItemCount = 0;

  orders.forEach((order) => {
    const sellerItems = getSellerItems(order);

    if (sellerItems.length === 0) return;

    visibleOrderCount += 1;

    optionItemCount += sellerItems.filter(
      (item) => hasProductOption(item)
    ).length;

    const sellerTotals =
      calculateSellerOrderTotals(sellerItems);

    totalSellerEarnings +=
      sellerTotals.sellerAmount;

    totalCommission +=
      sellerTotals.commissionAmount;

    sellerOrdersList.appendChild(
      createSellerOrderCard(
        order,
        sellerItems,
        sellerTotals
      )
    );
  });

  renderStats(
    visibleOrderCount,
    totalSellerEarnings,
    totalCommission,
    optionItemCount
  );

  if (sellerOrdersCountText) {
    sellerOrdersCountText.textContent =
      `${visibleOrderCount} order${
        visibleOrderCount === 1 ? "" : "s"
      }`;
  }
}

function orderBelongsToCurrentSeller(order) {
  if (!currentUser || !order) return false;

  const uid = currentUser.uid;

  if (order.sellerId === uid) return true;

  if (
    Array.isArray(order.sellerIds) &&
    order.sellerIds.includes(uid)
  ) {
    return true;
  }

  if (
    Array.isArray(order.items) &&
    order.items.some((item) => item?.sellerId === uid)
  ) {
    return true;
  }

  if (
    Array.isArray(order.pickupStops) &&
    order.pickupStops.some((stop) => stop?.sellerId === uid)
  ) {
    return true;
  }

  if (
    Array.isArray(order.sellerBreakdown) &&
    order.sellerBreakdown.some(
      (entry) => entry?.sellerId === uid
    )
  ) {
    return true;
  }

  return false;
}

function getSellerItems(order) {
  const uid = currentUser?.uid || "";

  if (!Array.isArray(order?.items)) return [];

  const directItems = order.items.filter(
    (item) => item?.sellerId === uid
  );

  if (directItems.length > 0) {
    return directItems;
  }

  const breakdownItems = Array.isArray(order.sellerBreakdown)
    ? order.sellerBreakdown
        .filter((entry) => entry?.sellerId === uid)
        .flatMap((entry) =>
          Array.isArray(entry.items) ? entry.items : []
        )
    : [];

  if (breakdownItems.length > 0) {
    return breakdownItems;
  }

  const pickupItems = Array.isArray(order.pickupStops)
    ? order.pickupStops
        .filter((stop) => stop?.sellerId === uid)
        .flatMap((stop) =>
          Array.isArray(stop.items) ? stop.items : []
        )
    : [];

  return pickupItems;
}


function normalizeSellerOrderVariant(item = {}) {
  const selectedSizeValue = String(
    item.selectedSizeValue ??
    item.sizeValue ??
    item.selectedOptionValue ??
    item.optionValue ??
    item.measurementValue ??
    ""
  ).trim();

  const selectedSizeUnit = String(
    item.selectedSizeUnit ??
    item.sizeUnit ??
    item.selectedOptionUnit ??
    item.optionUnit ??
    item.measurementUnit ??
    ""
  ).trim();

  const selectedSize =
    String(
      item.selectedSize ??
      item.selectedSizeName ??
      item.sizeName ??
      item.sizeDisplayValue ??
      ""
    ).trim() ||
    buildOptionDisplayValue(
      selectedSizeValue,
      selectedSizeUnit
    );

  const selectedColour = String(
    item.selectedColour ??
    item.selectedColourName ??
    item.colourName ??
    item.colorName ??
    item.colourValue ??
    item.colorValue ??
    item.colour ??
    item.color ??
    ""
  ).trim();

  const selectedColourCode = String(
    item.selectedColourCode ??
    item.colourCode ??
    item.colorCode ??
    item.colourHex ??
    item.colorHex ??
    ""
  ).trim();

  const optionDisplayValue =
    String(
      item.selectedOptionDisplayValue ??
      item.optionDisplayValue ??
      item.displayValue ??
      ""
    ).trim() ||
    (
      selectedSize && selectedColour
        ? `${selectedSize} / ${selectedColour}`
        : selectedSize || selectedColour
    ) ||
    String(
      item.selectedOptionName ??
      item.optionName ??
      item.name ??
      item.label ??
      ""
    ).trim();

  const productCode = String(
    item.selectedOptionSku ??
    item.optionSku ??
    item.productCode ??
    item.sku ??
    ""
  ).trim();

  return {
    selectedSize,
    selectedSizeName:
      String(
        item.selectedSizeName ??
        item.sizeName ??
        selectedSize
      ).trim(),

    selectedSizeValue,
    selectedSizeUnit,

    selectedColour,
    selectedColourName:
      String(
        item.selectedColourName ??
        item.colourName ??
        item.colorName ??
        selectedColour
      ).trim(),

    selectedColourCode,

    optionDisplayValue,
    productCode,

    variantStructure:
      item.variantStructure ||
      (
        selectedSize || selectedColour
          ? "size-colour"
          : ""
      ),

    imageUrl:
      item.selectedOptionImageUrl ||
      item.selectedOptionImage ||
      item.optionImageUrl ||
      item.optionImage ||
      item.imageUrl ||
      "",

    stock:
      item.selectedOptionStock ??
      item.optionStock ??
      item.variantStock ??
      null
  };
}

function isHexColour(value) {
  return /^#[0-9a-f]{6}$/i.test(
    String(value || "").trim()
  );
}

/* =========================================================
   ORDER CARD
   ========================================================= */

function createSellerOrderCard(
  order,
  sellerItems,
  sellerTotals
) {
  const card = document.createElement("article");
  card.className =
    "order-card seller-order-card";

  card.dataset.orderId = order.id || "";
  card.dataset.orderStatus =
    order.orderStatus || "Pending Payment";

  const paymentNotice =
    order.paymentStatus !== "verified"
      ? `
        <p class="muted">
          <strong>Waiting:</strong>
          Admin has not verified this payment yet.
        </p>
      `
      : `
        <p>
          <strong>Payment:</strong>
          Verified
        </p>
      `;

  const canStartPreparing =
    order.paymentStatus === "verified" &&
    (
      order.orderStatus === "Payment Submitted" ||
      order.orderStatus === "Pending Payment" ||
      !order.orderStatus
    );

  const canMarkReady =
    order.paymentStatus === "verified" &&
    order.orderStatus === "Preparing Order";

  const statusButtons = `
    ${
      canStartPreparing
        ? `
          <button
            class="ready-btn start-preparing-btn"
            type="button">
            Start Preparing
          </button>
        `
        : ""
    }

    ${
      canMarkReady
        ? `
          <button
            class="approve-btn ready-pickup-btn"
            type="button">
            Mark Ready for Pickup
          </button>
        `
        : ""
    }
  `;

  const driverInfo =
    order.deliveryGuyName
      ? `
        <p>
          <strong>Assigned Driver:</strong>
          ${escapeHtml(order.deliveryGuyName)}
        </p>
      `
      : "";

  const itemsHtml = sellerItems
    .map((item) => {
      return renderSellerOrderItem(item);
    })
    .join("");

  card.innerHTML = `
    <div class="section-row-title">

      <div>
        <h3>
          Order #${escapeHtml(order.id.slice(0, 8))}
        </h3>

        <p class="muted">
          ${formatDate(order.createdAt)}
        </p>
      </div>

      <span class="status-pill">
        ${escapeHtml(
          order.orderStatus ||
          "Pending Payment"
        )}
      </span>

    </div>

    <div class="tracking-box">

      <span class="${stepClass(order.orderStatus, "Pending Payment")}">
        Pending
      </span>

      <span class="${stepClass(order.orderStatus, "Payment Submitted")}">
        Submitted
      </span>

      <span class="${stepClass(order.orderStatus, "Preparing Order")}">
        Preparing
      </span>

      <span class="${stepClass(order.orderStatus, "Ready for Pickup")}">
        Ready
      </span>

      <span class="${stepClass(order.orderStatus, "Picked Up")}">
        Picked Up
      </span>

      <span class="${stepClass(order.orderStatus, "Out for Delivery")}">
        Out
      </span>

      <span class="${stepClass(order.orderStatus, "Delivery Submitted")}">
        Checking
      </span>

      <span class="${stepClass(order.orderStatus, "Delivered")}">
        Delivered
      </span>

    </div>

    <div class="seller-order-grid">

      <div class="seller-order-customer-box">

        <p>
          <strong>Customer:</strong>
          ${escapeHtml(
            order.customerName ||
            "Not provided"
          )}
        </p>

        <p>
          <strong>Phone:</strong>
          ${escapeHtml(
            order.customerPhone ||
            "Not provided"
          )}
        </p>

        <p>
          <strong>Address:</strong>
          ${escapeHtml(
            order.deliveryAddress ||
            "Not provided"
          )}
        </p>

        ${
          order.orderNotes
            ? `
              <p>
                <strong>Order Notes:</strong>
                ${escapeHtml(order.orderNotes)}
              </p>
            `
            : ""
        }

        ${driverInfo}
        ${paymentNotice}

      </div>

      <div class="seller-order-money-box">

        <p>
          <strong>
            Buyer paid for your items:
          </strong>
        </p>

        <h3>
          ${formatRs(sellerTotals.buyerAmount)}
        </h3>

        <p>
          <strong>You receive:</strong>
          ${formatRs(sellerTotals.sellerAmount)}
        </p>

        <p>
          <strong>MauMarket 10%:</strong>
          ${formatRs(sellerTotals.commissionAmount)}
        </p>

      </div>

    </div>

    <div class="seller-order-items-heading">

      <h4>
        Your Items
      </h4>

      <span>
        ${sellerItems.reduce(
          (sum, item) =>
            sum + Number(item.quantity || 1),
          0
        )}
        item(s)
      </span>

    </div>

    <ul class="seller-order-items-list">
      ${itemsHtml}
    </ul>

    <div
      class="seller-actions"
      aria-live="polite">
      ${statusButtons}
    </div>

    <p
      class="seller-order-action-message"
      aria-live="polite">
    </p>
  `;

  const actionMessage =
    card.querySelector(
      ".seller-order-action-message"
    );

  card
    .querySelector(
      ".start-preparing-btn"
    )
    ?.addEventListener(
      "click",
      async (event) => {
        const button = event.currentTarget;

        button.disabled = true;
        button.textContent = "Updating...";

        setActionMessage(
          actionMessage,
          "Updating order status...",
          "info"
        );

        try {
          await updateDoc(
            doc(db, "orders", order.id),
            {
              orderStatus:
                "Preparing Order",

              sellerPreparingAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
            }
          );

          await loadSellerOrders();
        } catch (error) {
          button.disabled = false;
          button.textContent =
            "Start Preparing";

          setActionMessage(
            actionMessage,
            getFriendlySellerOrderError(
              error,
              "The order status could not be updated."
            ),
            "error"
          );
        }
      }
    );

  card
    .querySelector(
      ".ready-pickup-btn"
    )
    ?.addEventListener(
      "click",
      async (event) => {
        const button = event.currentTarget;

        button.disabled = true;
        button.textContent = "Updating...";

        setActionMessage(
          actionMessage,
          "Marking order as ready...",
          "info"
        );

        try {
          await updateDoc(
            doc(db, "orders", order.id),
            {
              orderStatus:
                "Ready for Pickup",

              sellerReadyAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
            }
          );

          await loadSellerOrders();
        } catch (error) {
          button.disabled = false;
          button.textContent =
            "Mark Ready for Pickup";

          setActionMessage(
            actionMessage,
            getFriendlySellerOrderError(
              error,
              "The order status could not be updated."
            ),
            "error"
          );
        }
      }
    );

  return card;
}

/* =========================================================
   SELLER ORDER ITEM
   ========================================================= */

function renderSellerOrderItem(item) {
  const quantity = Math.max(
    1,
    Number(item.quantity || 1)
  );

  const buyerPrice = getBuyerPrice(item);
  const sellerPrice = getSellerPrice(item);
  const commissionAmount =
    getCommissionAmount(item);

  const buyerSubtotal = roundMoney(
    buyerPrice * quantity
  );

  const sellerSubtotal = roundMoney(
    sellerPrice * quantity
  );

  const commissionSubtotal = roundMoney(
    commissionAmount * quantity
  );

  const variant =
    normalizeSellerOrderVariant(item);

  const hasOption =
    hasProductOption(item);

  const colourSwatch =
    isHexColour(
      variant.selectedColourCode
    )
      ? `
          <span
            class="seller-order-colour-swatch"
            style="display:inline-block;width:14px;height:14px;border-radius:50%;border:1px solid rgba(0,0,0,.2);background:${escapeHtml(
              variant.selectedColourCode
            )};vertical-align:-2px;margin-right:6px;"
            aria-hidden="true"
          ></span>
        `
      : "";

  const stockInfo =
    variant.stock !== null &&
    variant.stock !== undefined
      ? `
          <span>
            <strong>
              Variant stock when ordered:
            </strong>
            ${Number(variant.stock || 0)}
          </span>
        `
      : "";

  return `
    <li class="seller-order-item seller-order-option-item">

      <div class="seller-order-item-image">

        ${
          variant.imageUrl
            ? `
                <img
                  src="${escapeHtml(variant.imageUrl)}"
                  alt="${escapeHtml(
                    item.title ||
                    "Product"
                  )}"
                >
              `
            : `
                <div class="no-img">
                  No Image
                </div>
              `
        }

      </div>

      <div class="seller-order-item-main">

        <div class="seller-order-item-title-row">

          <div>

            <strong>
              ${escapeHtml(
                item.title ||
                "Item"
              )}
            </strong>

            <p class="muted">
              ${escapeHtml(
                item.category ||
                ""
              )}
            </p>

          </div>

          <span class="seller-order-quantity-badge">
            Qty ${quantity}
          </span>

        </div>

        ${
          hasOption
            ? `
                <div class="seller-order-option-card seller-order-size-colour-card">

                  <div>

                    <span>
                      Selected Variant
                    </span>

                    <strong>
                      ${escapeHtml(
                        variant.optionDisplayValue ||
                        "Selected variant"
                      )}
                    </strong>

                  </div>

                  ${
                    variant.selectedSize
                      ? `
                          <div>

                            <span>
                              Size
                            </span>

                            <strong>
                              ${escapeHtml(
                                variant.selectedSize
                              )}
                            </strong>

                          </div>
                        `
                      : ""
                  }

                  ${
                    variant.selectedColour
                      ? `
                          <div>

                            <span>
                              Colour
                            </span>

                            <strong>
                              ${colourSwatch}
                              ${escapeHtml(
                                variant.selectedColour
                              )}
                            </strong>

                          </div>
                        `
                      : ""
                  }

                  ${
                    variant.productCode
                      ? `
                          <div>

                            <span>
                              Product Code
                            </span>

                            <strong>
                              ${escapeHtml(
                                variant.productCode
                              )}
                            </strong>

                          </div>
                        `
                      : ""
                  }

                </div>
              `
            : ""
        }

        <div class="seller-order-price-lines">

          <span>
            Buyer:
            ${formatRs(buyerPrice)}
            × ${quantity}
            =
            ${formatRs(buyerSubtotal)}
          </span>

          <span>
            Seller earns:
            ${formatRs(sellerSubtotal)}
          </span>

          <span>
            MauMarket 10%:
            ${formatRs(commissionSubtotal)}
          </span>

          ${stockInfo}

        </div>

      </div>

    </li>
  `;
}

function hasProductOption(item) {
  const variant =
    normalizeSellerOrderVariant(item || {});

  return Boolean(
    item?.hasOptions === true ||
    item?.selectedOptionId ||
    item?.optionId ||
    item?.selectedOptionName ||
    item?.optionName ||
    item?.selectedOptionDisplayValue ||
    item?.optionDisplayValue ||
    variant.selectedSize ||
    variant.selectedColour ||
    variant.variantStructure ===
      "size-colour"
  );
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

  return `${cleanValue} ${
    labels[cleanUnit.toLowerCase()] ||
    cleanUnit
  }`;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/* =========================================================
   TOTALS
   ========================================================= */

function calculateSellerOrderTotals(items) {
  let buyerAmount = 0;
  let sellerAmount = 0;
  let commissionAmount = 0;

  items.forEach((item) => {
    const quantity =
      Math.max(
        1,
        Number(item.quantity || 1)
      );

    const buyerPrice =
      getBuyerPrice(item);

    const sellerPrice =
      getSellerPrice(item);

    const commission =
      getCommissionAmount(item);

    buyerAmount +=
      buyerPrice * quantity;

    sellerAmount +=
      sellerPrice * quantity;

    commissionAmount +=
      commission * quantity;
  });

  return {
    buyerAmount:
      roundMoney(buyerAmount),

    sellerAmount:
      roundMoney(sellerAmount),

    commissionAmount:
      roundMoney(commissionAmount)
  };
}

function renderStats(
  orderCount,
  sellerAmount,
  commissionAmount,
  optionItemCount = 0
) {
  if (sellerTotalOrders) {
    sellerTotalOrders.textContent =
      String(orderCount);
  }

  if (sellerTotalEarnings) {
    sellerTotalEarnings.textContent =
      formatRs(sellerAmount);
  }

  if (sellerTotalCommission) {
    sellerTotalCommission.textContent =
      formatRs(commissionAmount);
  }

  if (sellerOptionItems) {
    sellerOptionItems.textContent =
      String(optionItemCount);
  }
}

/* =========================================================
   PRICE HELPERS
   ========================================================= */

function getBuyerPrice(item) {
  const selectedVariantBuyerPrice =
    firstPositiveNumber([
      item?.selectedOptionBuyerPrice,
      item?.optionBuyerPrice,
      item?.variantBuyerPrice,
      item?.selectedOptionPrice,
      item?.optionPrice,
      item?.variantPrice
    ]);

  if (selectedVariantBuyerPrice > 0) {
    return roundMoney(
      selectedVariantBuyerPrice
    );
  }

  const buyerPrice =
    firstPositiveNumber([
      item?.buyerPrice,
      item?.price
    ]);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice);
  }

  const sellerPrice =
    firstPositiveNumber([
      item?.selectedOptionSellerPrice,
      item?.optionSellerPrice,
      item?.variantSellerPrice,
      item?.sellerPrice
    ]);

  if (sellerPrice > 0) {
    return roundMoney(
      sellerPrice *
      (
        1 +
        normalizeCommissionRate(
          item?.commissionRate
        )
      )
    );
  }

  return 0;
}

function getSellerPrice(item) {
  const selectedVariantSellerPrice =
    firstPositiveNumber([
      item?.selectedOptionSellerPrice,
      item?.optionSellerPrice,
      item?.variantSellerPrice
    ]);

  if (selectedVariantSellerPrice > 0) {
    return roundMoney(
      selectedVariantSellerPrice
    );
  }

  const sellerPrice =
    firstPositiveNumber([
      item?.sellerPrice
    ]);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice);
  }

  const buyerPrice =
    getBuyerPrice(item);

  if (buyerPrice > 0) {
    return roundMoney(
      buyerPrice /
      (
        1 +
        normalizeCommissionRate(
          item?.commissionRate
        )
      )
    );
  }

  return 0;
}

function getCommissionAmount(item) {
  const explicitCommission =
    firstPositiveNumber([
      item?.selectedOptionCommissionAmount,
      item?.optionCommissionAmount,
      item?.variantCommissionAmount,
      item?.commissionAmount
    ]);

  if (explicitCommission > 0) {
    return roundMoney(
      explicitCommission
    );
  }

  const sellerPrice =
    getSellerPrice(item);

  const buyerPrice =
    getBuyerPrice(item);

  return roundMoney(
    Math.max(
      0,
      buyerPrice - sellerPrice
    )
  );
}

function normalizeCommissionRate(value) {
  const rate = Number(value);

  if (
    !Number.isFinite(rate) ||
    rate < 0
  ) {
    return COMMISSION_RATE;
  }

  return rate;
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const number = Number(value);

    if (
      Number.isFinite(number) &&
      number > 0
    ) {
      return number;
    }
  }

  return 0;
}

/* =========================================================
   TRACKING
   ========================================================= */

function stepClass(
  currentStatus,
  stepStatus
) {
  const steps = [
    "Pending Payment",
    "Payment Submitted",
    "Preparing Order",
    "Ready for Pickup",
    "Picked Up",
    "Out for Delivery",
    "Delivery Submitted",
    "Delivered"
  ];

  if (
    currentStatus === "Payment Rejected" ||
    currentStatus === "Cancelled"
  ) {
    return "track-step cancelled";
  }

  const currentIndex =
    steps.indexOf(
      currentStatus ||
      "Pending Payment"
    );

  const stepIndex =
    steps.indexOf(stepStatus);

  return currentIndex >= stepIndex
    ? "track-step done"
    : "track-step";
}

/* =========================================================
   MESSAGES
   ========================================================= */

function setActionMessage(
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
    "seller-order-message-success",
    "seller-order-message-error",
    "seller-order-message-info"
  );

  if (!message || !type) return;

  element.classList.add(type);
  element.classList.add(
    `seller-order-message-${type}`
  );
}

function getFriendlySellerOrderError(
  error,
  fallbackMessage
) {
  const code =
    String(error?.code || "");

  const messages = {
    "permission-denied":
      "MauMarket could not access this seller-order query. Confirm that the deployed Firestore rules match the exact queried field and that the order stores your current Firebase UID at the top level.",

    "unavailable":
      "MauMarket is temporarily unavailable. Please try again.",

    "failed-precondition":
      "The order could not be updated. Please refresh and try again.",

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

function showSellerOrdersPageMessage(
  message,
  type = ""
) {
  if (!sellerOrdersPageMessage) return;

  sellerOrdersPageMessage.textContent =
    message || "";

  sellerOrdersPageMessage.hidden =
    !message;

  sellerOrdersPageMessage.classList.remove(
    "success",
    "error",
    "info",
    "seller-order-message-success",
    "seller-order-message-error",
    "seller-order-message-info"
  );

  if (message && type) {
    sellerOrdersPageMessage.classList.add(type);
    sellerOrdersPageMessage.classList.add(
      `seller-order-message-${type}`
    );
  }
}

function hideSellerOrdersPageMessage() {
  showSellerOrdersPageMessage("");
}


/* =========================================================
   FORMATTING
   ========================================================= */

function roundMoney(value) {
  return (
    Math.round(
      Number(value || 0) * 100
    ) / 100
  );
}

function formatRs(value) {
  return `Rs ${Number(value || 0).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  )}`;
}

function formatDate(timestamp) {
  if (!timestamp?.seconds) return "";

  return new Date(
    timestamp.seconds * 1000
  ).toLocaleString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
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
