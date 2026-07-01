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
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const COMMISSION_RATE = 0.10;

const totalSales = document.getElementById("totalSales");
const totalCommission = document.getElementById("totalCommission");
const totalSellerPayout = document.getElementById("totalSellerPayout");
const totalDeliveryFees = document.getElementById("totalDeliveryFees");
const commissionOrders = document.getElementById("commissionOrders");

const verifiedOrdersCount = document.getElementById("verifiedOrdersCount");
const avgCommission = document.getElementById("avgCommission");
const commissionOrdersCountText = document.getElementById("commissionOrdersCountText");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "admin" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadCommission();
});

async function loadCommission() {
  commissionOrders.innerHTML = "Loading orders...";

  const q = query(
    collection(db, "orders"),
    where("paymentStatus", "==", "verified")
  );

  const snapshot = await getDocs(q);

  const orders = [];

  snapshot.forEach((docSnap) => {
    orders.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  orders.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  let sales = 0;
  let commission = 0;
  let sellerPayout = 0;
  let deliveryFees = 0;

  commissionOrders.innerHTML = "";

  if (orders.length === 0) {
    commissionOrders.innerHTML = `
      <div class="order-card">
        <h3>No verified orders yet</h3>
        <p>Approve a customer payment first, then commission data will appear here.</p>
      </div>
    `;

    renderTotals({
      sales,
      commission,
      sellerPayout,
      deliveryFees,
      orderCount: 0
    });

    return;
  }

  orders.forEach((order) => {
    const totals = calculateOrderTotals(order);

    sales += totals.buyerSales;
    commission += totals.commissionAmount;
    sellerPayout += totals.sellerAmount;
    deliveryFees += totals.deliveryFee;

    const sellerBreakdownHtml = renderSellerBreakdown(order, totals);

    const div = document.createElement("div");
    div.className = "order-card commission-order-card";

    div.innerHTML = `
      <div class="section-row-title">
        <div>
          <h3>Order #${order.id.slice(0, 8)}</h3>
          <p class="muted">${formatDate(order.createdAt)}</p>
        </div>

        <span class="status-pill">
          ${escapeHtml(order.orderStatus || "Verified")}
        </span>
      </div>

      <p><strong>Customer:</strong> ${escapeHtml(order.customerName || "")}</p>
      <p><strong>Payment:</strong> ${escapeHtml(order.paymentStatus || "")}</p>

      <div class="commission-grid">
        <div>
          <span>Buyer Items Total</span>
          <strong>${formatRs(totals.itemsTotal)}</strong>
        </div>

        <div>
          <span>Delivery Fee</span>
          <strong>${formatRs(totals.deliveryFee)}</strong>
        </div>

        <div>
          <span>Grand Total</span>
          <strong>${formatRs(totals.grandTotal)}</strong>
        </div>

        <div>
          <span>MauMarket Commission</span>
          <strong>${formatRs(totals.commissionAmount)}</strong>
        </div>

        <div>
          <span>Seller Payout</span>
          <strong>${formatRs(totals.sellerAmount)}</strong>
        </div>
      </div>

      <h4>Seller Breakdown</h4>
      ${sellerBreakdownHtml}
    `;

    commissionOrders.appendChild(div);
  });

  renderTotals({
    sales,
    commission,
    sellerPayout,
    deliveryFees,
    orderCount: orders.length
  });
}

function calculateOrderTotals(order) {
  const items = Array.isArray(order.items) ? order.items : [];

  let itemsTotal = Number(order.itemsTotal || 0);
  let commissionAmount = Number(order.commissionAmount || 0);
  let sellerAmount = Number(order.sellerAmount || 0);

  if ((!itemsTotal || !commissionAmount || !sellerAmount) && items.length > 0) {
    itemsTotal = 0;
    commissionAmount = 0;
    sellerAmount = 0;

    items.forEach((item) => {
      const quantity = Number(item.quantity || 1);
      const buyerPrice = getBuyerPrice(item);
      const sellerPrice = getSellerPrice(item);
      const itemCommission = getCommissionAmount(item);

      itemsTotal += buyerPrice * quantity;
      sellerAmount += sellerPrice * quantity;
      commissionAmount += itemCommission * quantity;
    });
  }

  itemsTotal = roundMoney(itemsTotal);
  commissionAmount = roundMoney(commissionAmount);
  sellerAmount = roundMoney(sellerAmount);

  const deliveryFee = roundMoney(Number(order.deliveryFee || 0));
  const grandTotal = roundMoney(Number(order.grandTotal || itemsTotal + deliveryFee));
  const buyerSales = grandTotal;

  return {
    itemsTotal,
    deliveryFee,
    grandTotal,
    buyerSales,
    commissionAmount,
    sellerAmount
  };
}

function renderSellerBreakdown(order, totals) {
  if (Array.isArray(order.sellerBreakdown) && order.sellerBreakdown.length > 0) {
    return `
      <div class="seller-breakdown-list">
        ${order.sellerBreakdown.map((seller) => `
          <div class="seller-breakdown-card">
            <h4>${escapeHtml(seller.shopName || seller.sellerId || "Seller")}</h4>
            <p><strong>Buyer Items Total:</strong> ${formatRs(seller.itemsTotal || 0)}</p>
            <p><strong>Seller Payout:</strong> ${formatRs(seller.sellerAmount || 0)}</p>
            <p><strong>Commission:</strong> ${formatRs(seller.commissionAmount || 0)}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  return `
    <div class="seller-breakdown-list">
      <div class="seller-breakdown-card">
        <h4>All Sellers</h4>
        <p><strong>Buyer Items Total:</strong> ${formatRs(totals.itemsTotal)}</p>
        <p><strong>Seller Payout:</strong> ${formatRs(totals.sellerAmount)}</p>
        <p><strong>Commission:</strong> ${formatRs(totals.commissionAmount)}</p>
      </div>
    </div>
  `;
}

function renderTotals({ sales, commission, sellerPayout, deliveryFees, orderCount }) {
  totalSales.textContent = formatPlainNumber(sales);
  totalCommission.textContent = formatPlainNumber(commission);
  totalSellerPayout.textContent = formatPlainNumber(sellerPayout);
  totalDeliveryFees.textContent = formatPlainNumber(deliveryFees);

  if (verifiedOrdersCount) {
    verifiedOrdersCount.textContent = String(orderCount);
  }

  if (avgCommission) {
    const avg = orderCount > 0 ? commission / orderCount : 0;
    avgCommission.textContent = formatPlainNumber(avg);
  }

  if (commissionOrdersCountText) {
    commissionOrdersCountText.textContent = `${orderCount} verified order(s)`;
  }
}

function getBuyerPrice(item) {
  const buyerPrice = Number(item.buyerPrice || 0);

  if (buyerPrice > 0) return roundMoney(buyerPrice);

  const price = Number(item.price || 0);

  if (price > 0) return roundMoney(price);

  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) return roundMoney(sellerPrice * (1 + COMMISSION_RATE));

  return 0;
}

function getSellerPrice(item) {
  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) return roundMoney(sellerPrice);

  const buyerPrice = getBuyerPrice(item);

  if (buyerPrice > 0) return roundMoney(buyerPrice / (1 + COMMISSION_RATE));

  return 0;
}

function getCommissionAmount(item) {
  const commissionAmount = Number(item.commissionAmount || 0);

  if (commissionAmount > 0) return roundMoney(commissionAmount);

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

function formatDate(timestamp) {
  if (!timestamp?.seconds) return "";

  return new Date(timestamp.seconds * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
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
