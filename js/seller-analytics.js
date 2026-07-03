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

const els = {
  sellerProducts: document.getElementById("sellerProducts"),
  sellerOrders: document.getElementById("sellerOrders"),
  sellerRevenue: document.getElementById("sellerRevenue"),
  sellerRatingAvg: document.getElementById("sellerRatingAvg"),
  sellerReviews: document.getElementById("sellerReviews"),

  sellerDeliveredOrders: document.getElementById("sellerDeliveredOrders"),
  sellerPendingOrders: document.getElementById("sellerPendingOrders"),
  sellerAverageOrder: document.getElementById("sellerAverageOrder"),
  sellerReviewCount: document.getElementById("sellerReviewCount"),

  sellerBadge: document.getElementById("sellerBadge"),
  sellerPerformanceSummary: document.getElementById("sellerPerformanceSummary"),
  bestProductsBox: document.getElementById("bestProductsBox"),
  recentOrdersBox: document.getElementById("recentOrdersBox"),
  orderStatusBox: document.getElementById("orderStatusBox"),
  productRevenueBox: document.getElementById("productRevenueBox"),
  reviewSummaryText: document.getElementById("reviewSummaryText"),

  salesTrendChart: document.getElementById("salesTrendChart"),
  ordersTrendChart: document.getElementById("ordersTrendChart"),
  productsSoldChart: document.getElementById("productsSoldChart"),
  orderStatusCanvas: document.getElementById("orderStatusCanvas")
};

let currentUser = null;
let latestStats = null;
let resizeTimer = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
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

    await loadSellerAnalytics();
  } catch (error) {
    showError(error.message);
  }
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    if (latestStats) drawAllCharts(latestStats);
  }, 200);
});

async function loadSellerAnalytics() {
  setLoadingState();

  const [products, orders, reviews] = await Promise.all([
    loadSellerProducts(),
    loadSellerOrders(),
    loadSellerReviews()
  ]);

  const stats = calculateStats(products, orders, reviews);
  latestStats = stats;

  updateMainCards(stats);
  renderPerformanceSummary(stats);
  renderBestProducts(stats.bestProducts);
  renderRecentOrders(stats.verifiedOrders);
  renderOrderStatusBreakdown(stats.statusCounts);
  renderProductRevenue(stats.productRevenueList);
  renderReviews(reviews, stats);
  drawAllCharts(stats);
}

async function loadSellerProducts() {
  try {
    const q = query(
      collection(db, "products"),
      where("sellerId", "==", currentUser.uid)
    );

    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (error) {
    console.warn("Products analytics unavailable:", error.message);
    return [];
  }
}

async function loadSellerOrders() {
  try {
    const q = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", currentUser.uid)
    );

    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (error) {
    console.warn("Orders analytics unavailable:", error.message);
    return [];
  }
}

async function loadSellerReviews() {
  try {
    const snap = await getDocs(collection(db, "reviews"));

    return snap.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .filter((review) => {
        return (
          review.sellerId === currentUser.uid ||
          (review.sellerIds || []).includes(currentUser.uid)
        );
      });
  } catch (error) {
    console.warn("Reviews analytics unavailable:", error.message);
    return [];
  }
}

function calculateStats(products, orders, reviews) {
  const verifiedOrders = [];
  let revenue = 0;
  let deliveredOrders = 0;
  let pendingOrders = 0;

  const statusCounts = {};
  const productSalesMap = {};
  const productRevenueMap = {};
  const dailyRevenueMap = {};
  const dailyOrdersMap = {};

  orders.forEach((order) => {
    const status = order.orderStatus || "Pending";

    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (status === "Delivered") deliveredOrders++;

    if (status !== "Delivered" && status !== "Cancelled") {
      pendingOrders++;
    }

    if (order.paymentStatus !== "verified") return;

    const sellerItems = (order.items || []).filter((item) => {
      return item.sellerId === currentUser.uid;
    });

    if (!sellerItems.length) return;

    verifiedOrders.push(order);

    const dateLabel = getDateLabel(order.createdAt || order.updatedAt);
    dailyOrdersMap[dateLabel] = (dailyOrdersMap[dateLabel] || 0) + 1;

    sellerItems.forEach((item) => {
      const title = item.title || "Untitled Product";
      const quantity = Number(item.quantity || 1);
      const subtotal = Number(
        item.subtotal || Number(item.price || 0) * quantity
      );

      revenue += subtotal;

      dailyRevenueMap[dateLabel] = (dailyRevenueMap[dateLabel] || 0) + subtotal;
      productSalesMap[title] = (productSalesMap[title] || 0) + quantity;
      productRevenueMap[title] = (productRevenueMap[title] || 0) + subtotal;
    });
  });

  let ratingTotal = 0;
  let deliveryRatingTotal = 0;
  let deliveryRatingCount = 0;

  reviews.forEach((review) => {
    ratingTotal += Number(review.sellerRating || review.rating || 0);

    if (Number(review.deliveryRating || 0) > 0) {
      deliveryRatingTotal += Number(review.deliveryRating || 0);
      deliveryRatingCount++;
    }
  });

  const averageRating = reviews.length ? ratingTotal / reviews.length : 0;

  const averageDeliveryRating = deliveryRatingCount
    ? deliveryRatingTotal / deliveryRatingCount
    : 0;

  const averageOrderValue = verifiedOrders.length
    ? revenue / verifiedOrders.length
    : 0;

  const bestProducts = Object.entries(productSalesMap)
    .map(([title, sold]) => ({
      title,
      sold,
      revenue: productRevenueMap[title] || 0
    }))
    .sort((a, b) => b.sold - a.sold);

  const productRevenueList = Object.entries(productRevenueMap)
    .map(([title, amount]) => ({
      title,
      amount
    }))
    .sort((a, b) => b.amount - a.amount);

  const sortedReviews = [...reviews].sort((a, b) => {
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  const sortedVerifiedOrders = [...verifiedOrders].sort((a, b) => {
    const aTime = a.createdAt?.seconds || a.updatedAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  const labels = getLast7DaysLabels();

  return {
    products,
    orders,
    reviews: sortedReviews,
    verifiedOrders: sortedVerifiedOrders,
    revenue,
    deliveredOrders,
    pendingOrders,
    averageRating,
    averageDeliveryRating,
    averageOrderValue,
    bestProducts,
    productRevenueList,
    statusCounts,
    salesTrend: labels.map((label) => ({
      label,
      value: dailyRevenueMap[label] || 0
    })),
    ordersTrend: labels.map((label) => ({
      label,
      value: dailyOrdersMap[label] || 0
    }))
  };
}

function setLoadingState() {
  [
    els.sellerProducts,
    els.sellerOrders,
    els.sellerRevenue,
    els.sellerRatingAvg,
    els.sellerDeliveredOrders,
    els.sellerPendingOrders,
    els.sellerAverageOrder,
    els.sellerReviewCount
  ].forEach((el) => {
    if (el) el.textContent = "...";
  });
}

function updateMainCards(stats) {
  setText(els.sellerProducts, stats.products.length);
  setText(els.sellerOrders, stats.verifiedOrders.length);
  setText(els.sellerRevenue, `Rs ${formatMoney(stats.revenue)}`);
  setText(els.sellerRatingAvg, stats.averageRating ? stats.averageRating.toFixed(1) : "0.0");
  setText(els.sellerDeliveredOrders, stats.deliveredOrders);
  setText(els.sellerPendingOrders, stats.pendingOrders);
  setText(els.sellerAverageOrder, `Rs ${formatMoney(stats.averageOrderValue)}`);
  setText(els.sellerReviewCount, stats.reviews.length);
}

function renderPerformanceSummary(stats) {
  const badge = getSellerBadge(stats);

  if (els.sellerBadge) els.sellerBadge.textContent = badge;
  if (!els.sellerPerformanceSummary) return;

  els.sellerPerformanceSummary.innerHTML = `
    <div class="analytics-mini-row">
      <span>Seller Status</span>
      <strong>${escapeHtml(badge)}</strong>
    </div>

    <div class="analytics-mini-row">
      <span>Seller Rating</span>
      <strong>${stats.averageRating ? stats.averageRating.toFixed(1) : "0.0"}</strong>
    </div>

    <div class="analytics-mini-row">
      <span>Delivery Rating</span>
      <strong>${stats.averageDeliveryRating ? stats.averageDeliveryRating.toFixed(1) : "0.0"}</strong>
    </div>

    <div class="analytics-mini-row">
      <span>Average Order</span>
      <strong>Rs ${formatMoney(stats.averageOrderValue)}</strong>
    </div>
  `;
}

function renderBestProducts(bestProducts) {
  if (!els.bestProductsBox) return;

  if (!bestProducts.length) {
    els.bestProductsBox.innerHTML = emptyList("No product sales yet.");
    return;
  }

  els.bestProductsBox.innerHTML = bestProducts.slice(0, 8).map((item, index) => `
    <div class="analytics-list-item">
      <div class="analytics-rank">${index + 1}</div>

      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${item.sold} sold</span>
      </div>

      <b>Rs ${formatMoney(item.revenue)}</b>
    </div>
  `).join("");
}

function renderRecentOrders(orders) {
  if (!els.recentOrdersBox) return;

  if (!orders.length) {
    els.recentOrdersBox.innerHTML = emptyList("No verified orders yet.");
    return;
  }

  els.recentOrdersBox.innerHTML = orders.slice(0, 8).map((order) => {
    const sellerItems = (order.items || []).filter((item) => {
      return item.sellerId === currentUser.uid;
    });

    const total = sellerItems.reduce((sum, item) => {
      return sum + Number(item.subtotal || Number(item.price || 0) * Number(item.quantity || 1));
    }, 0);

    return `
      <div class="analytics-list-item">
        <div>
          <strong>Order #${escapeHtml(String(order.id).slice(0, 8))}</strong>
          <span>${escapeHtml(order.customerName || "Customer")} • ${escapeHtml(order.orderStatus || "Pending")}</span>
        </div>

        <b>Rs ${formatMoney(total)}</b>
      </div>
    `;
  }).join("");
}

function renderOrderStatusBreakdown(statusCounts) {
  if (!els.orderStatusBox) return;

  const entries = Object.entries(statusCounts || {});

  if (!entries.length) {
    els.orderStatusBox.innerHTML = emptyList("No orders yet.");
    return;
  }

  els.orderStatusBox.innerHTML = entries.map(([status, count]) => `
    <div class="analytics-mini-row">
      <span>${escapeHtml(status)}</span>
      <strong>${count}</strong>
    </div>
  `).join("");
}

function renderProductRevenue(productRevenueList) {
  if (!els.productRevenueBox) return;

  if (!productRevenueList.length) {
    els.productRevenueBox.innerHTML = emptyList("No product revenue yet.");
    return;
  }

  els.productRevenueBox.innerHTML = productRevenueList.slice(0, 8).map((item) => `
    <div class="analytics-mini-row">
      <span>${escapeHtml(item.title)}</span>
      <strong>Rs ${formatMoney(item.amount)}</strong>
    </div>
  `).join("");
}

function renderReviews(reviews, stats) {
  if (els.reviewSummaryText) {
    els.reviewSummaryText.textContent =
      `${reviews.length} review(s) • ${stats.averageRating ? stats.averageRating.toFixed(1) : "0.0"} average rating`;
  }

  if (!els.sellerReviews) return;

  if (!reviews.length) {
    els.sellerReviews.innerHTML = emptyList("No reviews yet.");
    return;
  }

  els.sellerReviews.innerHTML = reviews.slice(0, 8).map((review) => {
    const sellerRating = Number(review.sellerRating || review.rating || 0);
    const deliveryRating = Number(review.deliveryRating || 0);

    return `
      <div class="analytics-list-item review-list-item">
        <div>
          <strong>${escapeHtml(review.customerName || "Customer")}</strong>
          <span>Seller rating: ${sellerRating.toFixed(1)} • Delivery: ${
            deliveryRating > 0 ? deliveryRating.toFixed(1) : "Not rated"
          }</span>
          <p>${escapeHtml(review.reviewText || "No written review.")}</p>
        </div>
      </div>
    `;
  }).join("");
}

function drawAllCharts(stats) {
  drawLineChart(els.salesTrendChart, stats.salesTrend, {
    title: "Revenue",
    prefix: "Rs "
  });

  drawLineChart(els.ordersTrendChart, stats.ordersTrend, {
    title: "Orders",
    prefix: ""
  });

  drawBarChart(els.productsSoldChart, stats.bestProducts.slice(0, 6), {
    title: "Products Sold",
    key: "sold"
  });

  drawDonutChart(els.orderStatusCanvas, stats.statusCounts);
}

function drawLineChart(canvas, data, options = {}) {
  if (!canvas) return;

  const ctx = setupCanvas(canvas);
  const { width, height } = getCanvasSize(canvas);

  ctx.clearRect(0, 0, width, height);

  const isMobile = width < 520;
  const padding = {
    top: 28,
    right: 16,
    bottom: isMobile ? 34 : 38,
    left: isMobile ? 34 : 52
  };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = data.map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(79, 53, 245, 0.22)");
  gradient.addColorStop(1, "rgba(79, 53, 245, 0.02)");

  ctx.beginPath();

  data.forEach((item, index) => {
    const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index;
    const y = padding.top + chartHeight - (Number(item.value || 0) / max) * chartHeight;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();

  data.forEach((item, index) => {
    const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index;
    const y = padding.top + chartHeight - (Number(item.value || 0) / max) * chartHeight;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = "#4f35f5";
  ctx.lineWidth = 3;
  ctx.stroke();

  data.forEach((item, index) => {
    const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index;
    const y = padding.top + chartHeight - (Number(item.value || 0) / max) * chartHeight;

    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "#4f35f5";
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#667085";
    ctx.font = isMobile ? "10px Arial" : "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(item.label, x, height - 10);
  });

  ctx.fillStyle = "#101828";
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  ctx.fillText(options.title || "Trend", padding.left, 16);
}

function drawBarChart(canvas, data, options = {}) {
  if (!canvas) return;

  const ctx = setupCanvas(canvas);
  const { width, height } = getCanvasSize(canvas);

  ctx.clearRect(0, 0, width, height);

  if (!data.length) {
    drawEmptyChart(ctx, width, height, "No product sales yet");
    return;
  }

  const isMobile = width < 520;
  const padding = {
    top: 28,
    right: 12,
    bottom: isMobile ? 48 : 44,
    left: 36
  };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((item) => Number(item[options.key] || 0)), 1);
  const gap = isMobile ? 8 : 12;
  const barWidth = Math.max((chartWidth / data.length) - gap, 16);

  data.forEach((item, index) => {
    const value = Number(item[options.key] || 0);
    const barHeight = (value / max) * chartHeight;
    const x = padding.left + index * (chartWidth / data.length) + gap / 2;
    const y = padding.top + chartHeight - barHeight;

    ctx.fillStyle = "#4f35f5";
    roundRect(ctx, x, y, barWidth, barHeight, 8);
    ctx.fill();

    ctx.fillStyle = "#101828";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(value, x + barWidth / 2, y - 6);

    ctx.fillStyle = "#667085";
    ctx.font = isMobile ? "9px Arial" : "10px Arial";
    ctx.fillText(shortText(item.title, isMobile ? 7 : 10), x + barWidth / 2, height - 12);
  });

  ctx.fillStyle = "#101828";
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  ctx.fillText(options.title || "Bars", padding.left, 16);
}

function drawDonutChart(canvas, counts) {
  if (!canvas) return;

  const ctx = setupCanvas(canvas);
  const { width, height } = getCanvasSize(canvas);

  ctx.clearRect(0, 0, width, height);

  const entries = Object.entries(counts || {}).filter((entry) => Number(entry[1]) > 0);

  if (!entries.length) {
    drawEmptyChart(ctx, width, height, "No orders yet");
    return;
  }

  const isMobile = width < 520;
  const colors = ["#4f35f5", "#f59e0b", "#16a34a", "#2563eb", "#dc2626", "#9333ea"];
  const total = entries.reduce((sum, entry) => sum + Number(entry[1] || 0), 0);

  const cx = isMobile ? width / 2 : width * 0.34;
  const cy = isMobile ? height * 0.38 : height / 2;
  const radius = Math.min(width, height) * (isMobile ? 0.20 : 0.26);
  const innerRadius = radius * 0.58;

  let start = -Math.PI / 2;

  entries.forEach(([label, count], index) => {
    const slice = (Number(count || 0) / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.arc(cx, cy, innerRadius, start + slice, start, true);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();

    start += slice;
  });

  ctx.fillStyle = "#101828";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(total, cx, cy + 6);

  renderLegend(ctx, entries, colors, width, height, isMobile);
}

function renderLegend(ctx, entries, colors, width, height, isMobile) {
  ctx.font = isMobile ? "11px Arial" : "12px Arial";
  ctx.textAlign = "left";

  const startX = isMobile ? 18 : width * 0.62;
  const startY = isMobile ? height - entries.length * 21 - 10 : 42;

  entries.forEach(([label, count], index) => {
    const y = startY + index * 21;

    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(startX, y - 10, 11, 11);

    ctx.fillStyle = "#344054";
    ctx.fillText(`${label}: ${count}`, startX + 18, y);
  });
}

function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = getCanvasSize(canvas);
  const ratio = window.devicePixelRatio || 1;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  return ctx;
}

function getCanvasSize(canvas) {
  const parent = canvas.parentElement;
  const width = Math.max(parent?.clientWidth || canvas.clientWidth || 320, 260);
  const height = Math.max(parent?.clientHeight || 280, 240);

  return { width, height };
}

function drawEmptyChart(ctx, width, height, message) {
  ctx.fillStyle = "#667085";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function getLast7DaysLabels() {
  const labels = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    labels.push(date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    }));
  }

  return labels;
}

function getDateLabel(timestamp) {
  if (!timestamp?.seconds) {
    return new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  }

  return new Date(timestamp.seconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function getSellerBadge(stats) {
  if (stats.averageRating >= 4.8 && stats.reviews.length >= 10) {
    return "Top Rated Seller";
  }

  if (stats.averageRating >= 4.5 && stats.reviews.length >= 3) {
    return "Trusted Seller";
  }

  if (stats.verifiedOrders.length >= 5) {
    return "Rising Seller";
  }

  if (stats.products.length > 0) {
    return "Active Seller";
  }

  return "New Seller";
}

function sideMetric(label, value) {
  return `
    <div class="analytics-mini-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function emptyList(message) {
  return `
    <div class="analytics-empty">
      ${escapeHtml(message)}
    </div>
  `;
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function shortText(value, max = 10) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function showError(message) {
  if (els.sellerReviews) {
    els.sellerReviews.innerHTML = `
      <div class="analytics-empty">
        Could not load seller analytics: ${escapeHtml(message)}
      </div>
    `;
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
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
