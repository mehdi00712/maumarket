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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const paymentsList = document.getElementById("paymentsList");

const paymentSearchInput = document.getElementById("paymentSearchInput");
const paymentStatusFilter = document.getElementById("paymentStatusFilter");
const paymentDateFilter = document.getElementById("paymentDateFilter");
const clearPaymentFiltersBtn = document.getElementById("clearPaymentFiltersBtn");
const refreshPaymentsBtn = document.getElementById("refreshPaymentsBtn");
const exportPaymentsBtn = document.getElementById("exportPaymentsBtn");
const printPaymentsBtn = document.getElementById("printPaymentsBtn");

const totalPaymentsCount = document.getElementById("totalPaymentsCount");
const pendingPaymentsCount = document.getElementById("pendingPaymentsCount");
const verifiedPaymentsCount = document.getElementById("verifiedPaymentsCount");
const rejectedPaymentsCount = document.getElementById("rejectedPaymentsCount");
const verifiedRevenueTotal = document.getElementById("verifiedRevenueTotal");
const paymentResultCount = document.getElementById("paymentResultCount");

let currentUser = null;
let allPayments = [];
let filteredPayments = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const userSnap = await getDoc(doc(db, "users", currentUser.uid));

    if (
      !userSnap.exists() ||
      userSnap.data().role !== "admin" ||
      userSnap.data().approved !== true ||
      userSnap.data().blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    bindPaymentEvents();
    await loadPayments();
  } catch (error) {
    console.error(
      "Admin payment page initialization failed:",
      error
    );

    renderError(
      getFriendlyAdminPaymentError(
        error,
        "The payment dashboard could not be loaded."
      )
    );
  }
});

function bindPaymentEvents() {
  paymentSearchInput?.addEventListener("input", applyPaymentFilters);
  paymentStatusFilter?.addEventListener("change", applyPaymentFilters);
  paymentDateFilter?.addEventListener("change", applyPaymentFilters);

  clearPaymentFiltersBtn?.addEventListener("click", () => {
    if (paymentSearchInput) paymentSearchInput.value = "";
    if (paymentStatusFilter) paymentStatusFilter.value = "";
    if (paymentDateFilter) paymentDateFilter.value = "";
    applyPaymentFilters();
  });

  refreshPaymentsBtn?.addEventListener("click", loadPayments);

  exportPaymentsBtn?.addEventListener("click", () => {
    exportPaymentsCSV(filteredPayments);
  });

  printPaymentsBtn?.addEventListener("click", () => {
    printPaymentsReport(filteredPayments);
  });
}

async function loadPayments() {
  if (!paymentsList) return;

  paymentsList.innerHTML = `
    <div class="payment-empty-state">
      <h3>Loading payments...</h3>
      <p>Please wait while MauMarket loads payment records.</p>
    </div>
  `;

  try {
    const snapshot = await getDocs(collection(db, "orders"));

    allPayments = [];

    snapshot.forEach((docSnap) => {
      const order = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if (isPaymentOrder(order)) {
        allPayments.push(order);
      }
    });

    allPayments.sort((a, b) => {
      return getPaymentSortTime(b) - getPaymentSortTime(a);
    });

    applyPaymentFilters();
  } catch (error) {
    console.error(
      "Payment records could not load:",
      error
    );

    renderError(
      getFriendlyAdminPaymentError(
        error,
        "Payment records could not be loaded."
      )
    );
  }
}

function isPaymentOrder(order) {
  const status = order.paymentStatus || "";

  return (
    status === "submitted" ||
    status === "verified" ||
    status === "rejected" ||
    Boolean(order.paymentProofUrl)
  );
}

function applyPaymentFilters() {
  const search = normalize(paymentSearchInput?.value || "");
  const status = paymentStatusFilter?.value || "";
  const date = paymentDateFilter?.value || "";

  filteredPayments = allPayments.filter((order) => {
    const paymentStatus = order.paymentStatus || "";
    const paymentDate = getPaymentDateInput(order);

    const text = normalize(`
      ${order.id}
      ${order.customerName || ""}
      ${order.customerPhone || ""}
      ${order.customerEmail || ""}
      ${order.deliveryAddress || ""}
      ${order.paymentStatus || ""}
      ${order.orderStatus || ""}
      ${order.paymentRejectReason || ""}
      ${(order.items || []).map((item) => `
        ${item.title || ""}
        ${item.shopName || ""}
        ${item.optionType || ""}
        ${item.selectedOptionName || item.optionName || ""}
        ${item.selectedOptionSku || item.optionSku || item.sku || ""}
      `).join(" ")}
    `);

    const matchesSearch = !search || text.includes(search);
    const matchesStatus = !status || paymentStatus === status;
    const matchesDate = !date || paymentDate === date;

    return matchesSearch && matchesStatus && matchesDate;
  });

  updatePaymentStats();
  renderPayments(filteredPayments);
}

function updatePaymentStats() {
  const pending = allPayments.filter((order) => order.paymentStatus === "submitted").length;
  const verified = allPayments.filter((order) => order.paymentStatus === "verified").length;
  const rejected = allPayments.filter((order) => order.paymentStatus === "rejected").length;

  const verifiedRevenue = allPayments
    .filter((order) => order.paymentStatus === "verified")
    .reduce((sum, order) => sum + Number(order.grandTotal || 0), 0);

  if (totalPaymentsCount) totalPaymentsCount.textContent = allPayments.length;
  if (pendingPaymentsCount) pendingPaymentsCount.textContent = pending;
  if (verifiedPaymentsCount) verifiedPaymentsCount.textContent = verified;
  if (rejectedPaymentsCount) rejectedPaymentsCount.textContent = rejected;
  if (verifiedRevenueTotal) verifiedRevenueTotal.textContent = `Rs ${formatMoney(verifiedRevenue)}`;

  if (paymentResultCount) {
    paymentResultCount.textContent = `${filteredPayments.length} payment record(s) found`;
  }
}

function renderPayments(orders) {
  if (!paymentsList) return;

  if (orders.length === 0) {
    paymentsList.innerHTML = `
      <div class="payment-empty-state">
        <h3>No payments found</h3>
        <p>No payment records match your current filters.</p>
      </div>
    `;
    return;
  }

  paymentsList.innerHTML = orders.map((order) => paymentCardHtml(order)).join("");

  paymentsList.querySelectorAll("[data-payment-action]").forEach((button) => {
    button.addEventListener("click", handlePaymentAction);
  });
}

function paymentCardHtml(order) {
  const status = order.paymentStatus || "submitted";
  const orderStatus = order.orderStatus || "Pending";
  const proofUrl = order.paymentProofUrl || "";
  const statusClass = getPaymentStatusClass(status);
  const dateLabel = getReadablePaymentDate(order);

  const itemsHtml = (order.items || []).map((item) => {
    const option = getItemOptionDetails(item);
    const imageUrl =
      option.imageUrl ||
      item.imageUrl ||
      "";

    return `
      <li class="payment-item-row">

        <div class="payment-item-main">

          ${
            imageUrl
              ? `
                <img
                  class="payment-item-image"
                  src="${escapeHtml(imageUrl)}"
                  alt="${escapeHtml(item.title || "Item")}">
              `
              : ""
          }

          <div>

            <span class="payment-item-title">
              ${escapeHtml(item.title || "Item")}
            </span>

            ${
              option.hasOption
                ? `
                  <div class="payment-item-option">

                    <span>
                      ${escapeHtml(option.optionType)}:
                    </span>

                    <strong>
                      ${escapeHtml(option.optionName)}
                    </strong>

                    ${
                      option.optionSku
                        ? `
                          <small>
                            Product Code:
                            ${escapeHtml(option.optionSku)}
                          </small>
                        `
                        : ""
                    }

                  </div>
                `
                : ""
            }

          </div>

        </div>

        <strong>
          Rs ${formatMoney(getItemBuyerPrice(item))}
          × ${Number(item.quantity || 1)}
        </strong>

      </li>
    `;
  }).join("");

  return `
    <article class="payment-record-card">

      <div class="payment-record-main">
        <div class="payment-proof-preview">
          ${
            proofUrl
              ? `
                <a href="${escapeHtml(proofUrl)}" target="_blank" rel="noopener">
                  <img src="${escapeHtml(proofUrl)}" alt="Payment proof">
                </a>
              `
              : `
                <div class="no-proof-box">
                  No Proof
                </div>
              `
          }
        </div>

        <div class="payment-record-content">
          <div class="payment-record-head">
            <div>
              <span class="payment-order-id">Order #${escapeHtml(order.id.slice(0, 8))}</span>
              <h3>${escapeHtml(order.customerName || "Customer")}</h3>
              <p>${escapeHtml(order.customerPhone || "No phone number")}</p>
            </div>

            <span class="payment-status-pill ${statusClass}">
              ${escapeHtml(statusLabel(status))}
            </span>
          </div>

          <div class="payment-info-grid">
            <div>
              <small>Total Paid</small>
              <strong>Rs ${formatMoney(order.grandTotal || 0)}</strong>
            </div>

            <div>
              <small>Commission</small>
              <strong>Rs ${formatMoney(order.commissionAmount || order.platformCommission || order.commission || 0)}</strong>
            </div>

            <div>
              <small>Seller Amount</small>
              <strong>Rs ${formatMoney(order.sellerAmount || 0)}</strong>
            </div>

            <div>
              <small>Order Status</small>
              <strong>${escapeHtml(orderStatus)}</strong>
            </div>

            <div>
              <small>Date</small>
              <strong>${escapeHtml(dateLabel)}</strong>
            </div>
          </div>

          <details class="payment-details">
            <summary>View order items and payment history</summary>

            <div class="payment-detail-grid">
              <div>
                <h4>Order Items</h4>
                <ul class="payment-items-list">
                  ${itemsHtml || "<li>No items found.</li>"}
                </ul>
              </div>

              <div>
                <h4>Payment Timeline</h4>
                <div class="payment-timeline">
                  ${paymentTimeline(order)}
                </div>
              </div>
            </div>

            ${
              status === "rejected"
                ? `
                  <div class="payment-reject-note">
                    <strong>Reject Reason:</strong>
                    <p>${escapeHtml(order.paymentRejectReason || "No reason provided.")}</p>
                  </div>
                `
                : ""
            }
          </details>

          <div class="payment-actions">
            ${
              proofUrl
                ? `<a class="secondary-btn" href="${escapeHtml(proofUrl)}" target="_blank" rel="noopener">Open Proof</a>`
                : ""
            }

            <button
              type="button"
              class="secondary-btn"
              data-payment-action="print"
              data-order-id="${escapeHtml(order.id)}">
              Print
            </button>

            ${
              status === "submitted"
                ? `
                  <button
                    type="button"
                    class="approve-btn"
                    data-payment-action="approve"
                    data-order-id="${escapeHtml(order.id)}">
                    Approve Payment
                  </button>

                  <button
                    type="button"
                    class="danger-btn"
                    data-payment-action="reject"
                    data-order-id="${escapeHtml(order.id)}">
                    Reject Payment
                  </button>
                `
                : ""
            }

            ${
              status === "verified"
                ? `
                  <span class="payment-lock-note">Verified payment kept in history</span>
                `
                : ""
            }

            ${
              status === "rejected"
                ? `
                  <button
                    type="button"
                    class="approve-btn"
                    data-payment-action="approve"
                    data-order-id="${escapeHtml(order.id)}">
                    Approve After Review
                  </button>
                `
                : ""
            }
          </div>
        </div>
      </div>

    </article>
  `;
}

async function handlePaymentAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.paymentAction;
  const orderId = button.dataset.orderId;

  const order = allPayments.find((item) => item.id === orderId);

  if (!order) {
    alert("Order not found.");
    return;
  }

  if (action === "approve") {
    await approvePayment(order);
    return;
  }

  if (action === "reject") {
    await rejectPayment(order);
    return;
  }

  if (action === "print") {
    printSinglePayment(order);
  }
}

async function approvePayment(order) {
  if (!confirm(`Approve payment for order #${order.id.slice(0, 8)}?`)) {
    return;
  }

  try {
    await updateDoc(doc(db, "orders", order.id), {
      paymentStatus: "verified",
      orderStatus: "Preparing Order",
      paymentVerifiedAt: serverTimestamp(),
      paymentVerifiedBy: currentUser.uid,
      paymentRejectReason: "",
      updatedAt: serverTimestamp()
    });

    await loadPayments();
  } catch (error) {
    console.error(
      "Payment approval failed:",
      error
    );

    alert(
      getFriendlyAdminPaymentError(
        error,
        "The payment could not be approved."
      )
    );
  }
}

async function rejectPayment(order) {
  const reason = prompt("Reason for rejecting payment:");

  if (reason === null) return;

  try {
    await updateDoc(doc(db, "orders", order.id), {
      paymentStatus: "rejected",
      orderStatus: "Payment Rejected",
      paymentRejectReason: reason || "",
      paymentRejectedAt: serverTimestamp(),
      paymentRejectedBy: currentUser.uid,
      updatedAt: serverTimestamp()
    });

    await loadPayments();
  } catch (error) {
    console.error(
      "Payment rejection failed:",
      error
    );

    alert(
      getFriendlyAdminPaymentError(
        error,
        "The payment could not be rejected."
      )
    );
  }
}

function paymentTimeline(order) {
  const rows = [];

  rows.push(timelineRow("Order Created", order.createdAt));
  rows.push(timelineRow("Payment Submitted", order.paymentSubmittedAt));

  if (order.paymentStatus === "verified") {
    rows.push(timelineRow("Payment Verified", order.paymentVerifiedAt));
  }

  if (order.paymentStatus === "rejected") {
    rows.push(timelineRow("Payment Rejected", order.paymentRejectedAt || order.updatedAt));
  }

  rows.push(`
    <div class="payment-timeline-row current">
      <span></span>
      <div>
        <strong>Current Status</strong>
        <small>${escapeHtml(statusLabel(order.paymentStatus || "submitted"))}</small>
      </div>
    </div>
  `);

  return rows.join("");
}

function timelineRow(label, timestamp) {
  return `
    <div class="payment-timeline-row">
      <span></span>
      <div>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(formatTimestamp(timestamp))}</small>
      </div>
    </div>
  `;
}

function exportPaymentsCSV(orders) {
  if (!orders.length) {
    alert("No payments to export.");
    return;
  }

  const rows = [
    [
      "Order ID",
      "Customer",
      "Phone",
      "Payment Status",
      "Order Status",
      "Grand Total",
      "Commission",
      "Seller Amount",
      "Product Options",
      "Submitted At",
      "Verified At",
      "Rejected Reason"
    ]
  ];

  orders.forEach((order) => {
    rows.push([
      order.id,
      order.customerName || "",
      order.customerPhone || "",
      order.paymentStatus || "",
      order.orderStatus || "",
      Number(order.grandTotal || 0),
      Number(order.commissionAmount || order.platformCommission || order.commission || 0),
      Number(order.sellerAmount || 0),
      buildOrderOptionsSummary(order.items || []),
      formatTimestamp(order.paymentSubmittedAt),
      formatTimestamp(order.paymentVerifiedAt),
      order.paymentRejectReason || ""
    ]);
  });

  const csv = rows.map((row) => {
    return row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",");
  }).join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `maumarket-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

function printPaymentsReport(orders) {
  if (!orders.length) {
    alert("No payments to print.");
    return;
  }

  const html = `
    ${printStyles()}
    <main class="print-page">
      <header class="print-header">
        <h1>MauMarket Payment Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </header>

      <table class="print-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Submitted</th>
          </tr>
        </thead>

        <tbody>
          ${orders.map((order) => `
            <tr>
              <td>#${escapeHtml(order.id.slice(0, 8))}</td>
              <td>${escapeHtml(order.customerName || "Customer")}</td>
              <td>${escapeHtml(statusLabel(order.paymentStatus || ""))}</td>
              <td>Rs ${formatMoney(order.grandTotal || 0)}</td>
              <td>${escapeHtml(formatTimestamp(order.paymentSubmittedAt))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </main>
  `;

  openPrintWindow(html);
}

function printSinglePayment(order) {
  const itemsHtml = (order.items || []).map((item) => {
    const option = getItemOptionDetails(item);
    const quantity = Number(item.quantity || 1);
    const price = getItemBuyerPrice(item);

    return `
      <tr>
        <td>
          <strong>
            ${escapeHtml(item.title || "Item")}
          </strong>

          ${
            option.hasOption
              ? `
                <div class="print-option-line">
                  ${escapeHtml(option.optionType)}:
                  <strong>${escapeHtml(option.optionName)}</strong>

                  ${
                    option.optionSku
                      ? `
                        <br>
                        Product Code:
                        ${escapeHtml(option.optionSku)}
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }
        </td>

        <td>${quantity}</td>
        <td>Rs ${formatMoney(price)}</td>
        <td>Rs ${formatMoney(price * quantity)}</td>
      </tr>
    `;
  }).join("");

  const html = `
    ${printStyles()}
    <main class="print-page">
      <header class="print-header">
        <h1>MauMarket Payment Verification</h1>
        <p>Order #${escapeHtml(order.id)}</p>
      </header>

      <section class="print-grid">
        <div>
          <h3>Customer</h3>
          <p><strong>Name:</strong> ${escapeHtml(order.customerName || "")}</p>
          <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone || "")}</p>
          <p><strong>Address:</strong> ${escapeHtml(order.deliveryAddress || "")}</p>
        </div>

        <div>
          <h3>Payment</h3>
          <p><strong>Status:</strong> ${escapeHtml(statusLabel(order.paymentStatus || ""))}</p>
          <p><strong>Total:</strong> Rs ${formatMoney(order.grandTotal || 0)}</p>
          <p><strong>Commission:</strong> Rs ${formatMoney(order.commissionAmount || 0)}</p>
          <p><strong>Submitted:</strong> ${escapeHtml(formatTimestamp(order.paymentSubmittedAt))}</p>
        </div>
      </section>

      <h3>Items</h3>

      <table class="print-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          ${itemsHtml || `
            <tr>
              <td colspan="4">No items found.</td>
            </tr>
          `}
        </tbody>
      </table>

      <section class="print-total">
        <h2>Total Paid: Rs ${formatMoney(order.grandTotal || 0)}</h2>
      </section>
    </main>
  `;

  openPrintWindow(html);
}

function openPrintWindow(html) {
  const win = window.open("", "_blank", "width=1000,height=800");

  win.document.open();
  win.document.write(html);
  win.document.close();

  win.onload = () => {
    win.focus();
    win.print();
  };
}

function printStyles() {
  return `
    <style>
      body {
        margin: 0;
        padding: 30px;
        font-family: Arial, sans-serif;
        color: #111827;
      }

      .print-page {
        max-width: 1000px;
        margin: auto;
      }

      .print-header {
        border-bottom: 3px solid #4f35f5;
        margin-bottom: 25px;
        padding-bottom: 15px;
      }

      .print-header h1 {
        margin: 0;
        color: #4f35f5;
      }

      .print-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 25px;
        margin-bottom: 25px;
      }

      .print-grid div {
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
      }

      .print-table {
        width: 100%;
        border-collapse: collapse;
      }

      .print-table th,
      .print-table td {
        border: 1px solid #e5e7eb;
        padding: 10px;
        text-align: left;
      }

      .print-table th {
        background: #f3f4f6;
      }

      .print-total {
        margin-top: 25px;
        text-align: right;
      }

      .print-option-line {
        margin-top: 6px;
        color: #475569;
        font-size: 12px;
        line-height: 1.45;
      }

      .payment-item-row {
        gap: 14px;
      }

      .payment-item-main {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .payment-item-image {
        width: 50px;
        height: 50px;
        border-radius: 10px;
        object-fit: cover;
        border: 1px solid #e5e7eb;
      }

      .payment-item-option {
        display: grid;
        gap: 2px;
        margin-top: 4px;
        color: #475569;
        font-size: 12px;
      }
    </style>
  `;
}

function getItemOptionDetails(item) {
  const optionName =
    item.selectedOptionName ||
    item.optionName ||
    "";

  const optionSku =
    item.selectedOptionSku ||
    item.optionSku ||
    item.sku ||
    item.productCode ||
    "";

  const optionType =
    item.optionType ||
    "Option";

  const hasOption =
    item.hasOptions === true ||
    Boolean(
      item.selectedOptionId ||
      item.optionId ||
      optionName
    );

  return {
    hasOption,
    optionType,
    optionName,
    optionSku,

    imageUrl:
      item.selectedOptionImageUrl ||
      item.optionImageUrl ||
      item.imageUrl ||
      "",

    imageIndex:
      item.selectedOptionImageIndex ??
      item.optionImageIndex ??
      null,

    stock:
      item.selectedOptionStock ??
      item.optionStock ??
      null
  };
}

function getItemBuyerPrice(item) {
  const buyerPrice =
    Number(item?.buyerPrice || 0);

  if (buyerPrice > 0) {
    return buyerPrice;
  }

  const price =
    Number(item?.price || 0);

  if (price > 0) {
    return price;
  }

  const sellerPrice =
    Number(item?.sellerPrice || 0);

  if (sellerPrice > 0) {
    const rate =
      Number(
        item?.commissionRate ??
        0.10
      );

    return sellerPrice * (1 + rate);
  }

  return 0;
}

function buildOrderOptionsSummary(items) {
  if (!Array.isArray(items)) {
    return "";
  }

  return items
    .map((item) => {
      const option =
        getItemOptionDetails(item);

      if (!option.hasOption) {
        return "";
      }

      const parts = [
        item.title || "Item",
        `${option.optionType}: ${option.optionName}`
      ];

      if (option.optionSku) {
        parts.push(
          `Code: ${option.optionSku}`
        );
      }

      return parts.join(" | ");
    })
    .filter(Boolean)
    .join("; ");
}

function getPaymentSortTime(order) {
  return (
    order.paymentSubmittedAt?.seconds ||
    order.paymentVerifiedAt?.seconds ||
    order.paymentRejectedAt?.seconds ||
    order.updatedAt?.seconds ||
    order.createdAt?.seconds ||
    0
  );
}

function getPaymentDateInput(order) {
  const timestamp =
    order.paymentSubmittedAt ||
    order.paymentVerifiedAt ||
    order.paymentRejectedAt ||
    order.updatedAt ||
    order.createdAt;

  if (!timestamp?.seconds) return "";

  return new Date(timestamp.seconds * 1000).toISOString().slice(0, 10);
}

function getReadablePaymentDate(order) {
  const timestamp =
    order.paymentSubmittedAt ||
    order.paymentVerifiedAt ||
    order.paymentRejectedAt ||
    order.updatedAt ||
    order.createdAt;

  return formatTimestamp(timestamp);
}

function formatTimestamp(timestamp) {
  if (!timestamp?.seconds) return "Not available";

  return new Date(timestamp.seconds * 1000).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusLabel(status) {
  if (status === "submitted") return "Pending Verification";
  if (status === "verified") return "Verified";
  if (status === "rejected") return "Rejected";

  return status || "Unknown";
}

function getPaymentStatusClass(status) {
  if (status === "verified") return "success";
  if (status === "rejected") return "danger";
  if (status === "submitted") return "warning";

  return "neutral";
}

function getFriendlyAdminPaymentError(
  error,
  fallbackMessage
) {
  const code =
    String(error?.code || "");

  const messages = {
    "permission-denied":
      "You do not have permission to manage payments.",

    "unavailable":
      "MauMarket is temporarily unavailable. Please try again.",

    "failed-precondition":
      "The payment operation could not be completed. Please refresh and try again.",

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

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function renderError(message) {
  if (!paymentsList) return;

  paymentsList.innerHTML = `
    <div class="payment-empty-state">
      <h3>Could not load payments</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
