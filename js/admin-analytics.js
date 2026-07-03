import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const els = {
  totalUsers: document.getElementById("totalUsers"),
  totalSellers: document.getElementById("totalSellers"),
  totalCustomers: document.getElementById("totalCustomers"),
  totalDelivery: document.getElementById("totalDelivery"),
  totalProducts: document.getElementById("totalProducts"),
  totalOrders: document.getElementById("totalOrders"),
  deliveredOrders: document.getElementById("deliveredOrders"),
  totalRevenue: document.getElementById("totalRevenue"),
  commissionRevenue: document.getElementById("commissionRevenue"),
  pendingPayouts: document.getElementById("pendingPayouts"),
  averageOrderValue: document.getElementById("averageOrderValue"),
  totalReviews: document.getElementById("totalReviews"),
  analyticsUpdatedAt: document.getElementById("analyticsUpdatedAt"),

  recentOrders: document.getElementById("recentOrders"),
  topSellersBox: document.getElementById("topSellersBox"),
  topProductsBox: document.getElementById("topProductsBox"),
  platformHealthBox: document.getElementById("platformHealthBox"),
  sellerRevenueBox: document.getElementById("sellerRevenueBox"),
  deliveryStatusBox: document.getElementById("deliveryStatusBox"),

  adminRevenueChart: document.getElementById("adminRevenueChart"),
  adminOrdersChart: document.getElementById("adminOrdersChart"),
  userRolesChart: document.getElementById("userRolesChart"),
  adminOrderStatusChart: document.getElementById("adminOrderStatusChart")
};

let latestStats = null;
let resizeTimer = null;

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

    await loadAnalytics();
  } catch (error) {
    renderError(error.message);
  }
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    if (latestStats) drawAllCharts(latestStats);
  }, 200);
});

async function loadAnalytics() {
  setLoadingState();

  const [users, products, orders, reviews, payouts] = await Promise.all([
    fetchCollection("users"),
    fetchCollection("products"),
    fetchCollection("orders"),
    fetchCollection("reviews"),
    fetchCollection("payouts")
  ]);

  const stats = calculateStats(users, products, orders, reviews, payouts);
  latestStats = stats;

  updateCards(stats);
  renderTopSellers(stats.topSellers);
  renderTopProducts(stats.topProducts);
  renderRecentOrders(stats.recentOrders);
  renderPlatformHealth(stats);
  renderSellerRevenue(stats.sellerRevenueList);
  renderDeliveryStatus(stats.deliveryStatusCounts);
  drawAllCharts(stats);

  if (els.analyticsUpdatedAt) {
    els.analyticsUpdatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }
}

async function fetchCollection(name) {
  try {
    const snapshot = await getDocs(collection(db, name));

    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (error) {
    console.warn(`${name} analytics unavailable:`, error.message);
    return [];
  }
}

function setLoadingState() {
  [
    els.totalUsers,
    els.totalSellers,
    els.totalCustomers,
    els.totalDelivery,
    els.totalProducts,
    els.totalOrders,
    els.deliveredOrders,
    els.totalRevenue,
    els.commissionRevenue,
    els.pendingPayouts,
    els.averageOrderValue,
    els.totalReviews
  ].forEach((el) => {
    if (el) el.textContent = "...";
  });
}

function calculateStats(users, products, orders, reviews, payouts) {
  const roleCounts = {
    Customers: 0,
    Sellers: 0,
    Delivery: 0
  };

  users.forEach((user) => {
    if (user.role === "seller") roleCounts.Sellers++;
    else if (user.role === "delivery") roleCounts.Delivery++;
    else roleCounts.Customers++;
  });

  let revenue = 0;
  let commission = 0;
  let delivered = 0;
  let pending = 0;

  const sellerRevenueMap = {};
  const sellerNameMap = {};
  const productSalesMap = {};
  const productRevenueMap = {};
  const orderStatusCounts = {};
  const deliveryStatusCounts = {};
  const dailyRevenueMap = {};
  const dailyOrdersMap = {};

  orders.forEach((order) => {
    const orderStatus = order.orderStatus || "Pending";
    const deliveryStatus = order.deliveryStatus || order.orderStatus || "Not Started";

    orderStatusCounts[orderStatus] = (orderStatusCounts[orderStatus] || 0) + 1;
    deliveryStatusCounts[deliveryStatus] = (deliveryStatusCounts[deliveryStatus] || 0) + 1;

    if (orderStatus === "Delivered") delivered++;

    if (orderStatus !== "Delivered" && orderStatus !== "Cancelled") {
      pending++;
    }

    const dateLabel = getDateLabel(order.createdAt || order.updatedAt);
    dailyOrdersMap[dateLabel] = (dailyOrdersMap[dateLabel] || 0) + 1;

    if (order.paymentStatus !== "verified") return;

    const orderTotal = Number(order.grandTotal || 0);
    const orderCommission = Number(
      order.commissionAmount ||
      order.platformCommission ||
      order.commission ||
      orderTotal * 0.1 ||
      0
    );

    revenue += orderTotal;
    commission += orderCommission;

    dailyRevenueMap[dateLabel] = (dailyRevenueMap[dateLabel] || 0) + orderTotal;

    (order.items || []).forEach((item) => {
      const sellerId = item.sellerId || "unknown";
      const sellerName = item.shopName || item.sellerName || "Unknown Seller";
      const productTitle = item.title || "Untitled Product";
      const quantity = Number(item.quantity || 1);
      const subtotal = Number(item.subtotal || Number(item.price || 0) * quantity);

      sellerNameMap[sellerId] = sellerName;
      sellerRevenueMap[sellerId] = (sellerRevenueMap[sellerId] || 0) + subtotal;

      productSalesMap[productTitle] = (productSalesMap[productTitle] || 0) + quantity;
      productRevenueMap[productTitle] = (productRevenueMap[productTitle] || 0) + subtotal;
    });
  });

  let pendingPayoutTotal = 0;

  payouts.forEach((payout) => {
    if (payout.status === "pending" || payout.paid !== true) {
      pendingPayoutTotal += Number(payout.amount || payout.total || 0);
    }
  });

  const sellerRevenueList = Object.entries(sellerRevenueMap)
    .map(([sellerId, amount]) => ({
      sellerId,
      name: sellerNameMap[sellerId] || sellerId,
      amount
    }))
    .sort((a, b) => b.amount - a.amount);

  const topProducts = Object.entries(productSalesMap)
    .map(([title, sold]) => ({
      title,
      sold,
      revenue: productRevenueMap[title] || 0
    }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 8);

  const sortedOrders = [...orders].sort((a, b) => {
    const aTime = a.createdAt?.seconds || a.updatedAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  const labels = getLast7DaysLabels();

  return {
    totalUsers: users.length,
    sellers: roleCounts.Sellers,
    customers: roleCounts.Customers,
    delivery: roleCounts.Delivery,
    products: products.length,
    orders: orders.length,
    delivered,
    pending,
    revenue,
    commission,
    pendingPayoutTotal,
    reviews: reviews.length,
    averageOrderValue: revenue > 0 ? revenue / Math.max(orders.length, 1) : 0,
    orderStatusCounts,
    deliveryStatusCounts,
    userRoleCounts: roleCounts,
    sellerRevenueList,
    topSellers: sellerRevenueList.slice(0, 8),
    topProducts,
    recentOrders: sortedOrders.slice(0, 8),
    revenueTrend: labels.map((label) => ({
      label,
      value: dailyRevenueMap[label] || 0
    })),
    ordersTrend: labels.map((label) => ({
      label,
      value: dailyOrdersMap[label] || 0
    }))
  };
}

function updateCards(stats) {
  setText(els.totalUsers, stats.totalUsers);
  setText(els.totalSellers, stats.sellers);
  setText(els.totalCustomers, stats.customers);
  setText(els.totalDelivery, stats.delivery);
  setText(els.totalProducts, stats.products);
  setText(els.totalOrders, stats.orders);
  setText(els.deliveredOrders, stats.delivered);
  setText(els.totalRevenue, `Rs ${formatMoney(stats.revenue)}`);
  setText(els.commissionRevenue, `Rs ${formatMoney(stats.commission)}`);
  setText(els.pendingPayouts, `Rs ${formatMoney(stats.pendingPayoutTotal)}`);
  setText(els.averageOrderValue, `Rs ${formatMoney(stats.averageOrderValue)}`);
  setText(els.totalReviews, stats.reviews);
}

function renderTopSellers(sellers) {
  if (!els.topSellersBox) return;

  if (!sellers.length) {
    els.topSellersBox.innerHTML = emptyList("No seller sales yet.");
    return;
  }

  els.topSellersBox.innerHTML = sellers.map((seller, index) => `
    <div class="analytics-list-item">
      <div class="analytics-rank">${index + 1}</div>

      <div>
        <strong>${escapeHtml(seller.name)}</strong>
        <span>Verified sales</span>
      </div>

      <b>Rs ${formatMoney(seller.amount)}</b>
    </div>
  `).join("");
}

function renderTopProducts(products) {
  if (!els.topProductsBox) return;

  if (!products.length) {
    els.topProductsBox.innerHTML = emptyList("No product sales yet.");
    return;
  }

  els.topProductsBox.innerHTML = products.map((product, index) => `
    <div class="analytics-list-item">
      <div class="analytics-rank">${index + 1}</div>

      <div>
        <strong>${escapeHtml(product.title)}</strong>
        <span>${product.sold} sold</span>
      </div>

      <b>Rs ${formatMoney(product.revenue)}</b>
    </div>
  `).join("");
}

function renderRecentOrders(orders) {
  if (!els.recentOrders) return;

  if (!orders.length) {
    els.recentOrders.innerHTML = emptyList("No orders yet.");
    return;
  }

  els.recentOrders.innerHTML = orders.map((order) => `
    <div class="analytics-list-item">
      <div>
        <strong>Order #${escapeHtml(String(order.id).slice(0, 8))}</strong>
        <span>${escapeHtml(order.customerName || "Customer")} • ${escapeHtml(order.orderStatus || "Pending")}</span>
      </div>

      <b>Rs ${formatMoney(order.grandTotal || 0)}</b>
    </div>
  `).join("");
}

function renderPlatformHealth(stats) {
  if (!els.platformHealthBox) return;

  const deliveryRate = stats.orders > 0
    ? `${((stats.delivered / stats.orders) * 100).toFixed(1)}%`
    : "0%";

  els.platformHealthBox.innerHTML = `
    ${sideMetric("Delivery Success", deliveryRate)}
    ${sideMetric("Active Sellers", stats.sellers)}
    ${sideMetric("Products Listed", stats.products)}
    ${sideMetric("Reviews", stats.reviews)}
  `;
}

function renderSellerRevenue(list) {
  if (!els.sellerRevenueBox) return;

  if (!list.length) {
    els.sellerRevenueBox.innerHTML = emptyList("No seller revenue yet.");
    return;
  }

  els.sellerRevenueBox.innerHTML = list.slice(0, 8).map((seller) => `
    <div class="analytics-mini-row">
      <span>${escapeHtml(seller.name)}</span>
      <strong>Rs ${formatMoney(seller.amount)}</strong>
    </div>
  `).join("");
}

function renderDeliveryStatus(statusCounts) {
  if (!els.deliveryStatusBox) return;

  const entries = Object.entries(statusCounts || {});

  if (!entries.length) {
    els.deliveryStatusBox.innerHTML = emptyList("No delivery data yet.");
    return;
  }

  els.deliveryStatusBox.innerHTML = entries.map(([status, count]) => `
    <div class="analytics-mini-row">
      <span>${escapeHtml(status)}</span>
      <strong>${count}</strong>
    </div>
  `).join("");
}

function drawAllCharts(stats) {
  drawLineChart(els.adminRevenueChart, stats.revenueTrend, {
    title: "Revenue",
    prefix: "Rs "
  });

  drawLineChart(els.adminOrdersChart, stats.ordersTrend, {
    title: "Orders",
    prefix: ""
  });

  drawDonutChart(els.userRolesChart, stats.userRoleCounts);
  drawDonutChart(els.adminOrderStatusChart, stats.orderStatusCounts);
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

function drawDonutChart(canvas, counts) {
  if (!canvas) return;

  const ctx = setupCanvas(canvas);
  const { width, height } = getCanvasSize(canvas);

  ctx.clearRect(0, 0, width, height);

  const entries = Object.entries(counts || {}).filter((entry) => Number(entry[1]) > 0);

  if (!entries.length) {
    drawEmptyChart(ctx, width, height, "No data yet");
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

function renderError(message) {
  if (els.recentOrders) {
    els.recentOrders.innerHTML = `
      <div class="analytics-empty">
        Could not load admin analytics: ${escapeHtml(message)}
      </div>
    `;
  }
}
