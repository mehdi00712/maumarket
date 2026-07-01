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

const COMMISSION_RATE = 0.10;

const sellerOrdersList = document.getElementById("sellerOrdersList");
const sellerOrdersMenuBtn = document.getElementById("sellerOrdersMenuBtn");
const sellerOrdersNav = document.getElementById("sellerOrdersNav");

const sellerTotalOrders = document.getElementById("sellerTotalOrders");
const sellerTotalEarnings = document.getElementById("sellerTotalEarnings");
const sellerTotalCommission = document.getElementById("sellerTotalCommission");
const sellerOrdersCountText = document.getElementById("sellerOrdersCountText");

let currentUser = null;

sellerOrdersMenuBtn?.addEventListener("click", () => {
  sellerOrdersNav?.classList.toggle("show");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "seller" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadSellerOrders();
});

async function loadSellerOrders() {
  sellerOrdersList.innerHTML = `
    <div class="order-card">
      Loading seller orders...
    </div>
  `;

  try {
    const q = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      renderStats(0, 0, 0);

      if (sellerOrdersCountText) {
        sellerOrdersCountText.textContent = "0 orders";
      }

      sellerOrdersList.innerHTML = `
        <div class="order-card">
          <h3>No orders yet</h3>
          <p>When customers place orders for your products, they will appear here.</p>
        </div>
      `;
      return;
    }

    const orders = [];

    snapshot.forEach((docSnap) => {
      orders.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    orders.sort((a, b) => {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    sellerOrdersList.innerHTML = "";

    let visibleOrderCount = 0;
    let totalSellerEarnings = 0;
    let totalCommission = 0;

    orders.forEach((order) => {
      const sellerItems = (order.items || []).filter((item) => {
        return item.sellerId === currentUser.uid;
      });

      if (sellerItems.length === 0) return;

      visibleOrderCount++;

      const sellerTotals = calculateSellerOrderTotals(sellerItems);

      totalSellerEarnings += sellerTotals.sellerAmount;
      totalCommission += sellerTotals.commissionAmount;

      const itemsHtml = sellerItems.map((item) => {
        const quantity = Number(item.quantity || 1);
        const buyerPrice = getBuyerPrice(item);
        const sellerPrice = getSellerPrice(item);
        const commissionAmount = getCommissionAmount(item);
        const buyerSubtotal = roundMoney(buyerPrice * quantity);
        const sellerSubtotal = roundMoney(sellerPrice * quantity);
        const commissionSubtotal = roundMoney(commissionAmount * quantity);

        return `
          <li class="seller-order-item">
            <div>
              <strong>${escapeHtml(item.title || "Item")}</strong>
              <p class="muted">${escapeHtml(item.category || "")}</p>
            </div>

            <div class="seller-order-price-lines">
              <span>Buyer: ${formatRs(buyerPrice)} x ${quantity} = ${formatRs(buyerSubtotal)}</span>
              <span>Seller earns: ${formatRs(sellerSubtotal)}</span>
              <span>MauMarket 10%: ${formatRs(commissionSubtotal)}</span>
            </div>
          </li>
        `;
      }).join("");

      const paymentNotice =
        order.paymentStatus !== "verified"
          ? `<p class="muted"><strong>Waiting:</strong> Admin has not verified this payment yet.</p>`
          : `<p><strong>Payment:</strong> Verified</p>`;

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
            ? `<button class="ready-btn start-preparing-btn">Start Preparing</button>`
            : ""
        }

        ${
          canMarkReady
            ? `<button class="approve-btn ready-pickup-btn">Mark Ready for Pickup</button>`
            : ""
        }
      `;

      const driverInfo = order.deliveryGuyName
        ? `<p><strong>Assigned Driver:</strong> ${escapeHtml(order.deliveryGuyName)}</p>`
        : "";

      const div = document.createElement("div");
      div.className = "order-card seller-order-card";

      div.innerHTML = `
        <div class="section-row-title">
          <div>
            <h3>Order #${order.id.slice(0, 8)}</h3>
            <p class="muted">${formatDate(order.createdAt)}</p>
          </div>

          <span class="status-pill">
            ${escapeHtml(order.orderStatus || "Pending Payment")}
          </span>
        </div>

        <div class="tracking-box">
          <span class="${stepClass(order.orderStatus, "Pending Payment")}">Pending</span>
          <span class="${stepClass(order.orderStatus, "Payment Submitted")}">Submitted</span>
          <span class="${stepClass(order.orderStatus, "Preparing Order")}">Preparing</span>
          <span class="${stepClass(order.orderStatus, "Ready for Pickup")}">Ready</span>
          <span class="${stepClass(order.orderStatus, "Picked Up")}">Picked Up</span>
          <span class="${stepClass(order.orderStatus, "Out for Delivery")}">Out</span>
          <span class="${stepClass(order.orderStatus, "Delivery Submitted")}">Checking</span>
          <span class="${stepClass(order.orderStatus, "Delivered")}">Delivered</span>
        </div>

        <div class="seller-order-grid">
          <div>
            <p><strong>Customer:</strong> ${escapeHtml(order.customerName || "Not provided")}</p>
            <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone || "Not provided")}</p>
            <p><strong>Address:</strong> ${escapeHtml(order.deliveryAddress || "Not provided")}</p>
            ${driverInfo}
            ${paymentNotice}
          </div>

          <div class="seller-order-money-box">
            <p><strong>Buyer paid for your items:</strong></p>
            <h3>${formatRs(sellerTotals.buyerAmount)}</h3>

            <p><strong>You receive:</strong> ${formatRs(sellerTotals.sellerAmount)}</p>
            <p><strong>MauMarket 10%:</strong> ${formatRs(sellerTotals.commissionAmount)}</p>
          </div>
        </div>

        <h4>Your Items</h4>
        <ul class="seller-order-items-list">
          ${itemsHtml}
        </ul>

        <div class="seller-actions">
          ${statusButtons}
        </div>
      `;

      div.querySelector(".start-preparing-btn")?.addEventListener("click", async () => {
        await updateDoc(doc(db, "orders", order.id), {
          orderStatus: "Preparing Order",
          sellerPreparingAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await loadSellerOrders();
      });

      div.querySelector(".ready-pickup-btn")?.addEventListener("click", async () => {
        await updateDoc(doc(db, "orders", order.id), {
          orderStatus: "Ready for Pickup",
          sellerReadyAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await loadSellerOrders();
      });

      sellerOrdersList.appendChild(div);
    });

    renderStats(visibleOrderCount, totalSellerEarnings, totalCommission);

    if (sellerOrdersCountText) {
      sellerOrdersCountText.textContent = `${visibleOrderCount} order(s)`;
    }

    if (!sellerOrdersList.innerHTML.trim()) {
      sellerOrdersList.innerHTML = `
        <div class="order-card">
          <h3>No seller items found</h3>
          <p>This order may not contain products from your shop.</p>
        </div>
      `;
    }
  } catch (error) {
    sellerOrdersList.innerHTML = `
      <div class="order-card">
        <h3>Could not load seller orders</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function calculateSellerOrderTotals(items) {
  let buyerAmount = 0;
  let sellerAmount = 0;
  let commissionAmount = 0;

  items.forEach((item) => {
    const quantity = Number(item.quantity || 1);

    const buyerPrice = getBuyerPrice(item);
    const sellerPrice = getSellerPrice(item);
    const commission = getCommissionAmount(item);

    buyerAmount += buyerPrice * quantity;
    sellerAmount += sellerPrice * quantity;
    commissionAmount += commission * quantity;
  });

  return {
    buyerAmount: roundMoney(buyerAmount),
    sellerAmount: roundMoney(sellerAmount),
    commissionAmount: roundMoney(commissionAmount)
  };
}

function renderStats(orderCount, sellerAmount, commissionAmount) {
  if (sellerTotalOrders) {
    sellerTotalOrders.textContent = String(orderCount);
  }

  if (sellerTotalEarnings) {
    sellerTotalEarnings.textContent = formatRs(sellerAmount);
  }

  if (sellerTotalCommission) {
    sellerTotalCommission.textContent = formatRs(commissionAmount);
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

function stepClass(currentStatus, stepStatus) {
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

  if (currentStatus === "Payment Rejected" || currentStatus === "Cancelled") {
    return "track-step cancelled";
  }

  const currentIndex = steps.indexOf(currentStatus || "Pending Payment");
  const stepIndex = steps.indexOf(stepStatus);

  return currentIndex >= stepIndex ? "track-step done" : "track-step";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatRs(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
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
