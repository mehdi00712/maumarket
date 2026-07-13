import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  MauMarket admin-payouts.js
  -----------------------------------------------------------
  - Admin authentication and permission checks
  - Verified-order seller earnings
  - Accurate seller-price and commission calculations
  - Existing payout history
  - Pending payout calculation
  - Search, status filters and sorting
  - Safe rendering
  - Button loading states
  - Duplicate-payment protection through payout records
*/

const DEFAULT_COMMISSION_RATE = 0.10;

const payoutsList = document.getElementById("payoutsList");
const payoutsResultCount = document.getElementById("payoutsResultCount");

const payoutSearchInput = document.getElementById("payoutSearchInput");
const payoutStatusFilter = document.getElementById("payoutStatusFilter");
const payoutSortFilter = document.getElementById("payoutSortFilter");
const clearPayoutFiltersBtn = document.getElementById(
  "clearPayoutFiltersBtn"
);

const payoutSellersCount = document.getElementById("payoutSellersCount");
const totalSellerEarnings = document.getElementById(
  "totalSellerEarnings"
);
const totalPaidAmount = document.getElementById("totalPaidAmount");
const totalPendingPayouts = document.getElementById(
  "totalPendingPayouts"
);
const payoutCommissionTotal = document.getElementById(
  "payoutCommissionTotal"
);
const completedPayoutsCount = document.getElementById(
  "completedPayoutsCount"
);

let currentAdmin = null;

let allSellerPayouts = [];
let allPayoutTransactions = [];

let activeSearch = "";
let activeStatus = "";
let activeSort = "pending-high";

attachFilterEvents();

/* =========================================================
   AUTHENTICATION
   ========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
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

    currentAdmin = {
      uid: user.uid,
      ...userSnap.data()
    };

    await loadPayouts();
  } catch (error) {
    console.error("Admin verification failed:", error);

    showPageError(
      error.message || "Your administrator account could not be verified."
    );
  }
});

/* =========================================================
   LOAD PAYOUT DATA
   ========================================================= */

async function loadPayouts() {
  showLoadingState();

  try {
    const ordersQuery = query(
      collection(db, "orders"),
      where("paymentStatus", "==", "verified")
    );

    const [ordersSnap, payoutsSnap] = await Promise.all([
      getDocs(ordersQuery),
      getDocs(collection(db, "payouts"))
    ]);

    allPayoutTransactions = payoutsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    const paidBySeller = calculatePaidAmounts(
      allPayoutTransactions
    );

    const sellerTotals = calculateSellerTotals(ordersSnap);

    allSellerPayouts = Object.values(sellerTotals).map((seller) => {
      const alreadyPaid = roundMoney(
        paidBySeller[seller.sellerId] || 0
      );

      const pending = roundMoney(
        Math.max(0, seller.totalEarnings - alreadyPaid)
      );

      return {
        ...seller,
        alreadyPaid,
        pending,
        payoutStatus: getPayoutStatus({
          earnings: seller.totalEarnings,
          paid: alreadyPaid,
          pending
        })
      };
    });

    updateSummaryCards();
    renderPayouts();
  } catch (error) {
    console.error("Could not load payouts:", error);

    showPageError(
      error.message || "Seller payout information could not be loaded."
    );
  }
}

function calculatePaidAmounts(payoutTransactions) {
  const paidBySeller = {};

  payoutTransactions.forEach((payout) => {
    if (
      payout.status &&
      String(payout.status).toLowerCase() !== "paid"
    ) {
      return;
    }

    const sellerId = payout.sellerId || "";

    if (!sellerId) return;

    paidBySeller[sellerId] = roundMoney(
      Number(paidBySeller[sellerId] || 0) +
      Number(payout.amount || 0)
    );
  });

  return paidBySeller;
}

function calculateSellerTotals(ordersSnap) {
  const sellerTotals = {};

  ordersSnap.forEach((orderSnap) => {
    const order = {
      id: orderSnap.id,
      ...orderSnap.data()
    };

    const orderReference =
      order.orderNumber ||
      order.orderId ||
      orderSnap.id;

    const items = Array.isArray(order.items)
      ? order.items
      : [];

    items.forEach((item) => {
      const sellerId = item.sellerId || "";

      if (!sellerId) return;

      const quantity = Math.max(
        1,
        Number(item.quantity || 1)
      );

      const buyerUnitPrice = getBuyerUnitPrice(item);
      const sellerUnitPrice = getSellerUnitPrice(
        item,
        order,
        buyerUnitPrice
      );

      const buyerLineTotal = roundMoney(
        buyerUnitPrice * quantity
      );

      const sellerLineTotal = roundMoney(
        sellerUnitPrice * quantity
      );

      const commission = getLineCommission({
        item,
        order,
        buyerLineTotal,
        sellerLineTotal,
        quantity
      });

      if (!sellerTotals[sellerId]) {
        sellerTotals[sellerId] = {
          sellerId,
          shopName:
            item.shopName ||
            item.sellerName ||
            "MauMarket Seller",

          totalSales: 0,
          totalCommission: 0,
          totalEarnings: 0,

          orderIds: new Set(),
          itemCount: 0,
          latestOrderTime: 0
        };
      }

      const seller = sellerTotals[sellerId];

      seller.totalSales = roundMoney(
        seller.totalSales + buyerLineTotal
      );

      seller.totalCommission = roundMoney(
        seller.totalCommission + commission
      );

      seller.totalEarnings = roundMoney(
        seller.totalEarnings + sellerLineTotal
      );

      seller.itemCount += quantity;
      seller.orderIds.add(orderReference);

      const orderTime = Number(
        order.createdAt?.seconds ||
        order.verifiedAt?.seconds ||
        0
      );

      if (orderTime > seller.latestOrderTime) {
        seller.latestOrderTime = orderTime;
      }
    });
  });

  Object.values(sellerTotals).forEach((seller) => {
    seller.orderCount = seller.orderIds.size;
    seller.orderIds = Array.from(seller.orderIds);
  });

  return sellerTotals;
}

/* =========================================================
   PRICE CALCULATIONS
   ========================================================= */

function getBuyerUnitPrice(item) {
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
    return roundMoney(
      sellerPrice * (1 + DEFAULT_COMMISSION_RATE)
    );
  }

  return 0;
}

function getSellerUnitPrice(item, order, buyerUnitPrice) {
  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice);
  }

  const explicitCommission = Number(
    item.commissionAmount || 0
  );

  if (explicitCommission > 0) {
    return roundMoney(
      Math.max(0, buyerUnitPrice - explicitCommission)
    );
  }

  const commissionRate = getCommissionRate(item, order);

  return roundMoney(
    buyerUnitPrice / (1 + commissionRate)
  );
}

function getLineCommission({
  item,
  order,
  buyerLineTotal,
  sellerLineTotal,
  quantity
}) {
  const explicitItemCommission = Number(
    item.commissionAmount || 0
  );

  if (explicitItemCommission > 0) {
    return roundMoney(
      explicitItemCommission * quantity
    );
  }

  const calculatedDifference = roundMoney(
    buyerLineTotal - sellerLineTotal
  );

  if (calculatedDifference >= 0) {
    return calculatedDifference;
  }

  const commissionRate = getCommissionRate(item, order);

  return roundMoney(
    buyerLineTotal * commissionRate
  );
}

function getCommissionRate(item, order) {
  const itemRate = Number(item.commissionRate);

  if (Number.isFinite(itemRate) && itemRate >= 0) {
    return normalizeCommissionRate(itemRate);
  }

  const orderRate = Number(order.commissionRate);

  if (Number.isFinite(orderRate) && orderRate >= 0) {
    return normalizeCommissionRate(orderRate);
  }

  return DEFAULT_COMMISSION_RATE;
}

function normalizeCommissionRate(rate) {
  if (rate > 1) {
    return rate / 100;
  }

  return rate;
}

/* =========================================================
   RENDER PAYOUTS
   ========================================================= */

function renderPayouts() {
  if (!payoutsList) return;

  const search = activeSearch.toLowerCase().trim();

  let filtered = allSellerPayouts.filter((seller) => {
    const searchableText = `
      ${seller.shopName || ""}
      ${seller.sellerId || ""}
    `.toLowerCase();

    const matchesSearch =
      !search ||
      searchableText.includes(search);

    const matchesStatus =
      !activeStatus ||
      seller.payoutStatus === activeStatus;

    return matchesSearch && matchesStatus;
  });

  filtered = sortSellerPayouts(filtered, activeSort);

  payoutsList.innerHTML = "";

  if (!filtered.length) {
    payoutsList.innerHTML = `
      <div class="empty-market-card">
        <h3>No seller payouts found</h3>

        <p>
          No seller earnings match the selected filters.
        </p>

        <button
          id="clearEmptyPayoutFilters"
          type="button"
          class="secondary-btn"
        >
          Clear Filters
        </button>
      </div>
    `;

    document
      .getElementById("clearEmptyPayoutFilters")
      ?.addEventListener("click", clearFilters);
  } else {
    filtered.forEach((seller) => {
      payoutsList.appendChild(
        createPayoutCard(seller)
      );
    });
  }

  if (payoutsResultCount) {
    payoutsResultCount.textContent =
      `${filtered.length} seller${filtered.length === 1 ? "" : "s"}`;
  }
}

function createPayoutCard(seller) {
  const card = document.createElement("article");

  card.className = `seller-payout-card payout-status-${seller.payoutStatus}`;

  card.innerHTML = `
    <div class="seller-payout-card-head">

      <div class="seller-payout-identity">

        <div class="seller-payout-avatar">
          ${escapeHtml(getInitials(seller.shopName))}
        </div>

        <div>
          <span class="seller-payout-label">
            Seller Account
          </span>

          <h3>
            ${escapeHtml(seller.shopName)}
          </h3>

          <p>
            ${escapeHtml(seller.sellerId)}
          </p>
        </div>

      </div>

      <span class="seller-payout-status ${seller.payoutStatus}">
        ${escapeHtml(getPayoutStatusLabel(seller.payoutStatus))}
      </span>

    </div>

    <div class="seller-payout-summary">

      <div>
        <span>Total Sales</span>
        <strong>${formatRs(seller.totalSales)}</strong>
      </div>

      <div>
        <span>Commission</span>
        <strong>${formatRs(seller.totalCommission)}</strong>
      </div>

      <div>
        <span>Total Earnings</span>
        <strong>${formatRs(seller.totalEarnings)}</strong>
      </div>

      <div>
        <span>Already Paid</span>
        <strong>${formatRs(seller.alreadyPaid)}</strong>
      </div>

    </div>

    <div class="seller-payout-order-info">

      <span>
        ${seller.orderCount}
        verified order${seller.orderCount === 1 ? "" : "s"}
      </span>

      <span>
        ${seller.itemCount}
        item${seller.itemCount === 1 ? "" : "s"}
      </span>

    </div>

    <div class="seller-payout-pending-box">

      <div>
        <span>
          Pending Payout
        </span>

        <strong>
          ${formatRs(seller.pending)}
        </strong>
      </div>

      <button
        class="approve-btn seller-mark-paid-btn"
        type="button"
        ${seller.pending <= 0 ? "disabled" : ""}
      >
        ${seller.pending <= 0 ? "Fully Paid" : "Mark as Paid"}
      </button>

    </div>
  `;

  const payButton = card.querySelector(
    ".seller-mark-paid-btn"
  );

  payButton?.addEventListener("click", async () => {
    await markSellerPaid({
      seller,
      button: payButton
    });
  });

  return card;
}

/* =========================================================
   RECORD PAYOUT
   ========================================================= */

async function markSellerPaid({ seller, button }) {
  const amount = roundMoney(seller.pending);

  if (amount <= 0) return;

  const confirmPay = window.confirm(
    `Confirm that ${formatRs(amount)} has been paid to ${seller.shopName}?`
  );

  if (!confirmPay) return;

  const originalText = button.textContent;

  try {
    button.disabled = true;
    button.textContent = "Recording Payment...";

    await addDoc(collection(db, "payouts"), {
      sellerId: seller.sellerId,
      shopName: seller.shopName,

      amount,
      status: "paid",

      totalSalesAtPayment: seller.totalSales,
      totalCommissionAtPayment: seller.totalCommission,
      totalEarningsAtPayment: seller.totalEarnings,
      previousPaidAmount: seller.alreadyPaid,

      verifiedOrderCount: seller.orderCount,
      verifiedOrderIds: seller.orderIds,

      paidByAdminId: currentAdmin?.uid || "",
      paidByAdminName:
        currentAdmin?.name ||
        currentAdmin?.email ||
        "MauMarket Admin",

      paidAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    await loadPayouts();
  } catch (error) {
    console.error("Could not record payout:", error);

    window.alert(
      error.message || "The payout could not be recorded."
    );

    button.disabled = false;
    button.textContent = originalText;
  }
}

/* =========================================================
   FILTERS AND SORTING
   ========================================================= */

function attachFilterEvents() {
  payoutSearchInput?.addEventListener("input", () => {
    activeSearch = payoutSearchInput.value.trim();
    renderPayouts();
  });

  payoutStatusFilter?.addEventListener("change", () => {
    activeStatus = payoutStatusFilter.value;
    renderPayouts();
  });

  payoutSortFilter?.addEventListener("change", () => {
    activeSort = payoutSortFilter.value || "pending-high";
    renderPayouts();
  });

  clearPayoutFiltersBtn?.addEventListener(
    "click",
    clearFilters
  );
}

function clearFilters() {
  activeSearch = "";
  activeStatus = "";
  activeSort = "pending-high";

  if (payoutSearchInput) {
    payoutSearchInput.value = "";
  }

  if (payoutStatusFilter) {
    payoutStatusFilter.value = "";
  }

  if (payoutSortFilter) {
    payoutSortFilter.value = "pending-high";
  }

  renderPayouts();
}

function sortSellerPayouts(sellers, sort) {
  const copy = [...sellers];

  if (sort === "pending-high") {
    copy.sort(
      (a, b) =>
        Number(b.pending || 0) -
        Number(a.pending || 0)
    );
  }

  if (sort === "earnings-high") {
    copy.sort(
      (a, b) =>
        Number(b.totalEarnings || 0) -
        Number(a.totalEarnings || 0)
    );
  }

  if (sort === "paid-high") {
    copy.sort(
      (a, b) =>
        Number(b.alreadyPaid || 0) -
        Number(a.alreadyPaid || 0)
    );
  }

  if (sort === "alphabetical") {
    copy.sort((a, b) =>
      String(a.shopName || "").localeCompare(
        String(b.shopName || "")
      )
    );
  }

  return copy;
}

/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummaryCards() {
  const sellerCount = allSellerPayouts.length;

  const earningsTotal = allSellerPayouts.reduce(
    (sum, seller) =>
      sum + Number(seller.totalEarnings || 0),
    0
  );

  const paidTotal = allSellerPayouts.reduce(
    (sum, seller) =>
      sum + Number(seller.alreadyPaid || 0),
    0
  );

  const pendingTotal = allSellerPayouts.reduce(
    (sum, seller) =>
      sum + Number(seller.pending || 0),
    0
  );

  const commissionTotal = allSellerPayouts.reduce(
    (sum, seller) =>
      sum + Number(seller.totalCommission || 0),
    0
  );

  const completedCount = allPayoutTransactions.filter(
    (payout) =>
      !payout.status ||
      String(payout.status).toLowerCase() === "paid"
  ).length;

  if (payoutSellersCount) {
    payoutSellersCount.textContent = String(sellerCount);
  }

  if (totalSellerEarnings) {
    totalSellerEarnings.textContent =
      formatPlainNumber(earningsTotal);
  }

  if (totalPaidAmount) {
    totalPaidAmount.textContent =
      formatPlainNumber(paidTotal);
  }

  if (totalPendingPayouts) {
    totalPendingPayouts.textContent =
      formatPlainNumber(pendingTotal);
  }

  if (payoutCommissionTotal) {
    payoutCommissionTotal.textContent =
      formatPlainNumber(commissionTotal);
  }

  if (completedPayoutsCount) {
    completedPayoutsCount.textContent =
      String(completedCount);
  }
}

/* =========================================================
   STATUS HELPERS
   ========================================================= */

function getPayoutStatus({
  earnings,
  paid,
  pending
}) {
  if (earnings > 0 && pending <= 0) {
    return "paid";
  }

  if (paid > 0 && pending > 0) {
    return "partial";
  }

  return "pending";
}

function getPayoutStatusLabel(status) {
  if (status === "paid") {
    return "Fully Paid";
  }

  if (status === "partial") {
    return "Partially Paid";
  }

  return "Pending Payout";
}

/* =========================================================
   UI STATES
   ========================================================= */

function showLoadingState() {
  if (!payoutsList) return;

  payoutsList.innerHTML = Array.from({ length: 4 })
    .map(() => `
      <div class="seller-payout-card payout-skeleton-card">

        <div class="skeleton-line short"></div>

        <div class="skeleton-line"></div>

        <div class="skeleton-line medium"></div>

      </div>
    `)
    .join("");

  if (payoutsResultCount) {
    payoutsResultCount.textContent = "Loading...";
  }
}

function showPageError(message) {
  if (payoutsList) {
    payoutsList.innerHTML = `
      <div class="empty-market-card">
        <h3>Payouts could not load</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  if (payoutsResultCount) {
    payoutsResultCount.textContent = "Error";
  }
}

/* =========================================================
   FORMAT HELPERS
   ========================================================= */

function roundMoney(value) {
  return (
    Math.round(Number(value || 0) * 100) / 100
  );
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

function getInitials(value) {
  const words = String(value || "M")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return (
    words
      .map((word) => word.charAt(0).toUpperCase())
      .join("") || "M"
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
