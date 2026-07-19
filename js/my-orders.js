import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ordersList = document.getElementById("ordersList");
const orderSearch = document.getElementById("orderSearch");
const orderStatusFilter = document.getElementById("orderStatusFilter");
const ordersPageMessage = document.getElementById("ordersPageMessage");

let currentUser = null;
let reviewedOrderIds = new Set();
let allOrders = [];

orderSearch?.addEventListener("input", renderOrders);
orderStatusFilter?.addEventListener("change", renderOrders);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    await Promise.all([
      loadReviewedOrders(),
      loadOrders()
    ]);
  } catch (error) {
    console.error("Orders page could not load:", error);

    showOrdersError(
      getFriendlyOrdersError(
        error,
        "Your orders could not be loaded. Please refresh and try again."
      )
    );
  }
});

async function loadReviewedOrders() {
  const reviewsQuery = query(
    collection(db, "reviews"),
    where("customerId", "==", currentUser.uid)
  );

  const snapshot = await getDocs(reviewsQuery);

  reviewedOrderIds = new Set();

  snapshot.forEach((docSnap) => {
    const review = docSnap.data();

    if (review.orderId) {
      reviewedOrderIds.add(String(review.orderId));
    }
  });
}

async function loadOrders() {
  showOrdersLoading();

  const ordersQuery = query(
    collection(db, "orders"),
    where("customerId", "==", currentUser.uid)
  );

  const snapshot = await getDocs(ordersQuery);

  allOrders = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  allOrders.sort((a, b) => {
    return Number(b.createdAt?.seconds || 0) -
      Number(a.createdAt?.seconds || 0);
  });

  renderOrders();
}

function renderOrders() {
  if (!ordersList) return;

  ordersList.setAttribute("aria-busy", "false");

  const search = String(orderSearch?.value || "")
    .toLowerCase()
    .trim();

  const selectedStatus =
    String(orderStatusFilter?.value || "").trim();

  const filteredOrders = allOrders.filter((order) => {
    const searchableText = `
      ${order.id || ""}
      ${order.orderNumber || ""}
      ${order.orderStatus || ""}
      ${order.paymentStatus || ""}
      ${order.deliveryAddress || ""}
      ${(order.items || []).map((item) => `
        ${item.title || ""}
        ${item.selectedOptionName || item.optionName || ""}
        ${item.selectedOptionValue || item.optionValue || ""}
        ${item.selectedOptionUnit || item.optionUnit || ""}
        ${item.selectedOptionDisplayValue || item.optionDisplayValue || ""}
        ${item.selectedOptionSku || item.optionSku || item.productCode || item.sku || ""}
      `).join(" ")}
    `.toLowerCase();

    const matchesSearch =
      !search || searchableText.includes(search);

    const matchesStatus =
      !selectedStatus ||
      String(order.orderStatus || "") === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  if (allOrders.length === 0) {
    renderEmptyOrders();
    return;
  }

  if (filteredOrders.length === 0) {
    ordersList.innerHTML = `
      <div class="empty-market-card">
        <h3>No matching orders</h3>
        <p>Try changing your search or status filter.</p>
        <button
          id="clearOrderFiltersBtn"
          type="button"
          class="secondary-btn">
          Clear Filters
        </button>
      </div>
    `;

    document
      .getElementById("clearOrderFiltersBtn")
      ?.addEventListener("click", clearOrderFilters);

    return;
  }

  ordersList.innerHTML = "";

  filteredOrders.forEach((order) => {
    ordersList.appendChild(createOrderCard(order));
  });
}

function createOrderCard(order) {
  const orderStatus =
    order.orderStatus || "Pending Payment";

  const paymentStatus =
    order.paymentStatus || "not_paid";

  const items = Array.isArray(order.items)
    ? order.items
    : [];

  const itemsHtml = items.length
    ? items.map((item) => {
        const quantity = Number(item.quantity || 1);
        const price = Number(
          item.buyerPrice ||
          item.price ||
          0
        );

        const optionName =
          item.selectedOptionName ||
          item.optionName ||
          "";

        const optionValue =
          item.selectedOptionValue ||
          item.optionValue ||
          item.measurementValue ||
          item.sizeValue ||
          "";

        const optionUnit =
          item.selectedOptionUnit ||
          item.optionUnit ||
          item.measurementUnit ||
          item.sizeUnit ||
          "";

        const optionDisplayValue =
          item.selectedOptionDisplayValue ||
          item.optionDisplayValue ||
          buildOptionDisplayValue(
            optionValue,
            optionUnit
          ) ||
          optionName;

        const optionType =
          item.optionType || "Option";

        const optionSku =
          item.selectedOptionSku ||
          item.optionSku ||
          item.productCode ||
          item.sku ||
          "";

        return `
          <li class="customer-order-item">
            <div>
              <strong>${escapeHtml(item.title || "Item")}</strong>

              ${
                optionDisplayValue || optionName
                  ? `
                    <div class="order-option-badge">
                      ${escapeHtml(optionType)}:
                      <strong>
                        ${escapeHtml(
                          optionDisplayValue ||
                          optionName
                        )}
                      </strong>
                    </div>

                    ${
                      optionValue || optionUnit
                        ? `
                          <small class="order-option-measurement">
                            Size / Measurement:
                            ${escapeHtml(
                              buildOptionDisplayValue(
                                optionValue,
                                optionUnit
                              ) ||
                              optionDisplayValue
                            )}
                          </small>
                        `
                        : ""
                    }

                    ${
                      optionName &&
                      optionDisplayValue &&
                      normalizeText(optionName) !==
                        normalizeText(optionDisplayValue)
                        ? `
                          <small>
                            Option Name:
                            ${escapeHtml(optionName)}
                          </small>
                        `
                        : ""
                    }

                    ${
                      optionSku
                        ? `
                          <small>
                            Product Code:
                            ${escapeHtml(optionSku)}
                          </small>
                        `
                        : ""
                    }
                  `
                  : ""
              }

              <span>Verified MauMarket Merchant</span>
            </div>

            <div>
              ${quantity} × ${formatRs(price)}
            </div>
          </li>
        `;
      }).join("")
    : `
      <li class="customer-order-item">
        <div>
          <strong>No item details available</strong>
        </div>
      </li>
    `;

  const paymentButton =
    paymentStatus === "not_paid" ||
    paymentStatus === "rejected"
      ? `
        <a
          class="btn"
          href="payment.html?id=${encodeURIComponent(order.id)}">
          Pay with Juice
        </a>
      `
      : "";

  const proofButton = order.paymentProofUrl
    ? `
      <a
        class="small-link"
        href="${escapeHtml(order.paymentProofUrl)}"
        target="_blank"
        rel="noopener">
        View Payment Proof
      </a>
    `
    : "";

  const delivered =
    orderStatus === "Delivered";

  const reviewed =
    reviewedOrderIds.has(order.id);

  const reviewButton =
    delivered && !reviewed
      ? `
        <a
          class="btn"
          href="review.html?id=${encodeURIComponent(order.id)}">
          Leave Review
        </a>
      `
      : "";

  const reviewedBadge =
    delivered && reviewed
      ? `
        <span class="status-badge active">
          Reviewed
        </span>
      `
      : "";

  const rejectReason = order.paymentRejectReason
    ? `
      <div class="order-alert order-alert-danger">
        <strong>Payment Rejected</strong>
        <p>${escapeHtml(order.paymentRejectReason)}</p>
      </div>
    `
    : "";

  const deliveryNote = order.deliveryNote
    ? `
      <p>
        <strong>Delivery Note:</strong>
        ${escapeHtml(order.deliveryNote)}
      </p>
    `
    : "";

  const driverInfo = order.deliveryGuyName
    ? `
      <p>
        <strong>Delivery Driver:</strong>
        ${escapeHtml(order.deliveryGuyName)}
      </p>
    `
    : "";

  const deliverySubmitted =
    orderStatus === "Delivery Submitted"
      ? `
        <div class="order-alert">
          <strong>Delivery submitted</strong>
          <p>Waiting for MauMarket admin validation.</p>
        </div>
      `
      : "";

  const signatureInfo = order.deliverySignedBy
    ? `
      <p>
        <strong>Signed By:</strong>
        ${escapeHtml(order.deliverySignedBy)}
      </p>
    `
    : "";

  const orderReference =
    order.orderNumber ||
    order.orderId ||
    order.id;

  const card = document.createElement("article");
  card.className = "order-card premium-customer-order-card";
  card.dataset.orderId = order.id || "";
  card.dataset.orderStatus = orderStatus;

  card.innerHTML = `
    <div class="customer-order-card-head">
      <div>
        <span class="section-kicker">
          MauMarket Order
        </span>

        <h3>
          Order #${escapeHtml(shortReference(orderReference))}
          ${reviewedBadge}
        </h3>

        <p>
          Placed ${escapeHtml(formatTimestamp(order.createdAt))}
        </p>
      </div>

      <span class="status-pill">
        ${escapeHtml(orderStatus)}
      </span>
    </div>

    <div class="tracking-box">
      <span class="${getStepClass(orderStatus, "Pending Payment")}">
        Pending
      </span>

      <span class="${getStepClass(orderStatus, "Payment Submitted")}">
        Submitted
      </span>

      <span class="${getStepClass(orderStatus, "Preparing Order")}">
        Preparing
      </span>

      <span class="${getStepClass(orderStatus, "Ready for Pickup")}">
        Ready
      </span>

      <span class="${getStepClass(orderStatus, "Picked Up")}">
        Picked Up
      </span>

      <span class="${getStepClass(orderStatus, "Out for Delivery")}">
        Out
      </span>

      <span class="${getStepClass(orderStatus, "Delivery Submitted")}">
        Checking
      </span>

      <span class="${getStepClass(orderStatus, "Delivered")}">
        Delivered
      </span>
    </div>

    <div class="customer-order-summary-grid">
      <div>
        <span>Order Status</span>
        <strong>${escapeHtml(orderStatus)}</strong>
      </div>

      <div>
        <span>Payment Status</span>
        <strong>${escapeHtml(formatStatus(paymentStatus))}</strong>
      </div>

      <div>
        <span>Total</span>
        <strong>${formatRs(order.grandTotal || 0)}</strong>
      </div>

      <div>
        <span>Merchant</span>
        <strong>Verified MauMarket Merchant</strong>
      </div>
    </div>

    <div class="customer-order-delivery-box">
      <h4>Delivery Information</h4>

      <p>
        <strong>Address:</strong>
        ${escapeHtml(order.deliveryAddress || "Not provided")}
      </p>

      ${driverInfo}
      ${signatureInfo}
      ${deliveryNote}
    </div>

    ${deliverySubmitted}
    ${rejectReason}

    <div class="customer-order-items-box">
      <h4>Items</h4>

      <ul>
        ${itemsHtml}
      </ul>
    </div>

    <div class="seller-actions customer-order-actions">
      ${paymentButton}
      ${reviewButton}
    </div>

    ${proofButton}
  `;

  return card;
}

function clearOrderFilters() {
  if (orderSearch) {
    orderSearch.value = "";
  }

  if (orderStatusFilter) {
    orderStatusFilter.value = "";
  }

  renderOrders();
}

function renderEmptyOrders() {
  ordersList.innerHTML = `
    <div class="empty-market-card">
      <h3>No orders yet</h3>
      <p>
        Browse MauMarket and place your first secure order.
      </p>

      <a
        class="btn"
        href="products.html">
        Browse Marketplace
      </a>
    </div>
  `;
}

function showOrdersLoading() {
  if (!ordersList) return;

  ordersList.setAttribute("aria-busy", "true");

  if (ordersPageMessage) {
    ordersPageMessage.hidden = true;
    ordersPageMessage.textContent = "";
  }

  ordersList.innerHTML = Array.from({ length: 3 })
    .map(() => `
      <div class="order-card order-skeleton-card">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line medium"></div>
      </div>
    `)
    .join("");
}

function showOrdersError(message) {
  if (!ordersList) return;

  ordersList.setAttribute("aria-busy", "false");

  if (ordersPageMessage) {
    ordersPageMessage.textContent = message || "";
    ordersPageMessage.hidden = !message;
  }

  ordersList.innerHTML = `
    <div class="empty-market-card">
      <h3>Orders could not load</h3>
      <p>${escapeHtml(message)}</p>

      <button
        type="button"
        class="secondary-btn"
        onclick="window.location.reload()">
        Try Again
      </button>
    </div>
  `;
}

function getStepClass(currentStatus, stepStatus) {
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

  const currentIndex = steps.indexOf(
    currentStatus || "Pending Payment"
  );

  const stepIndex = steps.indexOf(stepStatus);

  return currentIndex >= stepIndex
    ? "track-step done"
    : "track-step";
}

function getFriendlyOrdersError(error, fallbackMessage) {
  const code = String(error?.code || "");

  const messages = {
    "permission-denied":
      "You do not have permission to access these orders.",
    "unavailable":
      "MauMarket is temporarily unavailable. Please try again.",
    "failed-precondition":
      "The orders could not be prepared. Please refresh and try again.",
    "resource-exhausted":
      "The service is temporarily busy. Please try again.",
    "auth/network-request-failed":
      "Please check your internet connection and try again."
  };

  return messages[code] || fallbackMessage;
}

function getOrderItemImage(item){
  return (
    item.selectedOptionImageUrl ||
    item.optionImageUrl ||
    item.imageUrl ||
    ""
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

function formatStatus(value) {
  return String(value || "Not available")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortReference(value) {
  const reference = String(value || "");

  return reference.length > 10
    ? reference.slice(0, 8)
    : reference;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "date unavailable";

  let date;

  if (typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (Number.isNaN(date.getTime())) {
    return "date unavailable";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatRs(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
