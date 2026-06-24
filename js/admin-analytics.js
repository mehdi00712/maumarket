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

const totalUsers = document.getElementById("totalUsers");
const totalSellers = document.getElementById("totalSellers");
const totalCustomers = document.getElementById("totalCustomers");
const totalDelivery = document.getElementById("totalDelivery");
const totalProducts = document.getElementById("totalProducts");
const totalOrders = document.getElementById("totalOrders");
const deliveredOrders = document.getElementById("deliveredOrders");
const totalRevenue = document.getElementById("totalRevenue");
const commissionRevenue = document.getElementById("commissionRevenue");
const pendingPayouts = document.getElementById("pendingPayouts");
const averageOrderValue = document.getElementById("averageOrderValue");
const totalReviews = document.getElementById("totalReviews");

const recentOrders = document.getElementById("recentOrders");
const topSellersBox = document.getElementById("topSellersBox");
const topProductsBox = document.getElementById("topProductsBox");
const platformHealthBox = document.getElementById("platformHealthBox");
const sellerRevenueBox = document.getElementById("sellerRevenueBox");
const deliveryStatusBox = document.getElementById("deliveryStatusBox");

const adminRevenueChart = document.getElementById("adminRevenueChart");
const adminOrdersChart = document.getElementById("adminOrdersChart");
const userRolesChart = document.getElementById("userRolesChart");
const adminOrderStatusChart = document.getElementById("adminOrderStatusChart");

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

async function loadAnalytics() {
  const users = [];
  const products = [];
  const orders = [];
  const reviews = [];
  const payouts = [];

  try {
    const snap = await getDocs(collection(db, "users"));
    snap.forEach((docSnap) => users.push({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn("Users analytics unavailable:", error.message);
  }

  try {
    const snap = await getDocs(collection(db, "products"));
    snap.forEach((docSnap) => products.push({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn("Products analytics unavailable:", error.message);
  }

  try {
    const snap = await getDocs(collection(db, "orders"));
    snap.forEach((docSnap) => orders.push({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn("Orders analytics unavailable:", error.message);
  }

  try {
    const snap = await getDocs(collection(db, "reviews"));
    snap.forEach((docSnap) => reviews.push({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn("Reviews analytics unavailable:", error.message);
  }

  try {
    const snap = await getDocs(collection(db, "payouts"));
    snap.forEach((docSnap) => payouts.push({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn("Payouts analytics unavailable:", error.message);
  }

  const stats = calculateStats(users, products, orders, reviews, payouts);

  updateCards(stats);
  renderTopSellers(stats.topSellers);
  renderTopProducts(stats.topProducts);
  renderRecentOrders(stats.recentOrders);
  renderPlatformHealth(stats);
  renderSellerRevenue(stats.sellerRevenueList);
  renderDeliveryStatus(stats.deliveryStatusCounts);

  drawLineChart(adminRevenueChart, stats.revenueTrend, "revenue", "Revenue");
  drawLineChart(adminOrdersChart, stats.ordersTrend, "orders", "Orders");
  drawPieChart(userRolesChart, stats.userRoleCounts);
  drawPieChart(adminOrderStatusChart, stats.orderStatusCounts);
}

function calculateStats(users, products, orders, reviews, payouts) {
  let sellers = 0;
  let customers = 0;
  let delivery = 0;

  users.forEach((user) => {
    if (user.role === "seller") sellers++;
    if (user.role === "customer") customers++;
    if (user.role === "delivery") delivery++;
  });

  let revenue = 0;
  let delivered = 0;
  let pending = 0;
  let commission = 0;

  const sellerRevenueMap = {};
  const sellerNameMap = {};
  const productSalesMap = {};
  const productRevenueMap = {};
  const orderStatusCounts = {};
  const deliveryStatusCounts = {};
  const dailyRevenueMap = {};
  const dailyOrdersMap = {};

  orders.forEach((order) => {
    const orderStatus = order.orderStatus || "Unknown";
    const deliveryStatus = order.deliveryStatus || "Not started";

    orderStatusCounts[orderStatus] = (orderStatusCounts[orderStatus] || 0) + 1;
    deliveryStatusCounts[deliveryStatus] = (deliveryStatusCounts[deliveryStatus] || 0) + 1;

    if (orderStatus === "Delivered") delivered++;

    if (orderStatus !== "Delivered" && orderStatus !== "Cancelled") {
      pending++;
    }

    if (order.paymentStatus !== "verified") return;

    const orderTotal = Number(order.grandTotal || 0);
    revenue += orderTotal;
    commission += Number(order.platformCommission || order.commission || orderTotal * 0.1 || 0);

    const dateLabel = getDateLabel(order.createdAt || order.updatedAt);
    dailyRevenueMap[dateLabel] = (dailyRevenueMap[dateLabel] || 0) + orderTotal;
    dailyOrdersMap[dateLabel] = (dailyOrdersMap[dateLabel] || 0) + 1;

    (order.items || []).forEach((item) => {
      const sellerId = item.sellerId || "unknown";
      const sellerName = item.shopName || item.sellerName || sellerId;
      const productTitle = item.title || "Untitled";
      const qty = Number(item.quantity || 1);
      const subtotal = Number(item.price || 0) * qty;

      sellerNameMap[sellerId] = sellerName;
      sellerRevenueMap[sellerId] = (sellerRevenueMap[sellerId] || 0) + subtotal;
      productSalesMap[productTitle] = (productSalesMap[productTitle] || 0) + qty;
      productRevenueMap[productTitle] = (productRevenueMap[productTitle] || 0) + subtotal;
    });
  });

  let pendingPayoutTotal = 0;

  payouts.forEach((payout) => {
    if (
      payout.status === "pending" ||
      payout.paid !== true
    ) {
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

  const topSellers = sellerRevenueList.slice(0, 8);

  const topProducts = Object.entries(productSalesMap)
    .map(([title, sold]) => ({
      title,
      sold,
      revenue: productRevenueMap[title] || 0
    }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 8);

  orders.sort((a, b) => {
    return (b.createdAt?.seconds || b.updatedAt?.seconds || 0) -
      (a.createdAt?.seconds || a.updatedAt?.seconds || 0);
  });

  const labels = getLast7DaysLabels();

  return {
    totalUsers: users.length,
    sellers,
    customers,
    delivery,
    products: products.length,
    orders: orders.length,
    delivered,
    pending,
    revenue,
    commission,
    pendingPayoutTotal,
    reviews: reviews.length,
    averageOrderValue: revenue > 0 && orders.length > 0 ? revenue / orders.length : 0,
    orderStatusCounts,
    deliveryStatusCounts,
    userRoleCounts: {
      Customers: customers,
      Sellers: sellers,
      Delivery: delivery
    },
    sellerRevenueList,
    topSellers,
    topProducts,
    recentOrders: orders.slice(0, 8),
    revenueTrend: labels.map((label) => ({
      label,
      revenue: dailyRevenueMap[label] || 0
    })),
    ordersTrend: labels.map((label) => ({
      label,
      orders: dailyOrdersMap[label] || 0
    }))
  };
}

function updateCards(stats) {
  totalUsers.textContent = stats.totalUsers;
  totalSellers.textContent = stats.sellers;
  totalCustomers.textContent = stats.customers;
  if (totalDelivery) totalDelivery.textContent = stats.delivery;
  totalProducts.textContent = stats.products;
  totalOrders.textContent = stats.orders;
  if (deliveredOrders) deliveredOrders.textContent = stats.delivered;
  totalRevenue.textContent = `Rs ${formatMoney(stats.revenue)}`;
  if (commissionRevenue) commissionRevenue.textContent = `Rs ${formatMoney(stats.commission)}`;
  if (pendingPayouts) pendingPayouts.textContent = `Rs ${formatMoney(stats.pendingPayoutTotal)}`;
  if (averageOrderValue) averageOrderValue.textContent = `Rs ${formatMoney(stats.averageOrderValue)}`;
  if (totalReviews) totalReviews.textContent = stats.reviews;
}

function renderTopSellers(sellers) {
  if (!topSellersBox) return;

  if (sellers.length === 0) {
    topSellersBox.innerHTML = "<p>No seller sales yet.</p>";
    return;
  }

  topSellersBox.innerHTML = sellers.map((seller, index) => `
    <div class="order-card">
      <h3>#${index + 1} ${escapeHtml(seller.name)}</h3>
      <p><strong>Sales:</strong> Rs ${formatMoney(seller.amount)}</p>
    </div>
  `).join("");
}

function renderTopProducts(products) {
  if (!topProductsBox) return;

  if (products.length === 0) {
    topProductsBox.innerHTML = "<p>No product sales yet.</p>";
    return;
  }

  topProductsBox.innerHTML = products.map((product, index) => `
    <div class="order-card">
      <h3>#${index + 1} ${escapeHtml(product.title)}</h3>
      <p><strong>Sold:</strong> ${product.sold}</p>
      <p><strong>Revenue:</strong> Rs ${formatMoney(product.revenue)}</p>
    </div>
  `).join("");
}

function renderRecentOrders(orders) {
  if (!recentOrders) return;

  if (orders.length === 0) {
    recentOrders.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  recentOrders.innerHTML = orders.map((order) => `
    <div class="order-card">
      <h3>Order #${escapeHtml(String(order.id).slice(0, 8))}</h3>
      <p><strong>Customer:</strong> ${escapeHtml(order.customerName || "Customer")}</p>
      <p><strong>Total:</strong> Rs ${formatMoney(order.grandTotal || 0)}</p>
      <p><strong>Payment:</strong> ${escapeHtml(order.paymentStatus || "Pending")}</p>
      <p><strong>Status:</strong> ${escapeHtml(order.orderStatus || "Pending")}</p>
    </div>
  `).join("");
}

function renderPlatformHealth(stats) {
  if (!platformHealthBox) return;

  const conversionText = stats.orders > 0
    ? `${((stats.delivered / stats.orders) * 100).toFixed(1)}% delivered`
    : "No orders yet";

  platformHealthBox.innerHTML = `
    <p><strong>Delivery success:</strong> ${conversionText}</p>
    <p><strong>Active sellers:</strong> ${stats.sellers}</p>
    <p><strong>Products listed:</strong> ${stats.products}</p>
    <p><strong>Reviews:</strong> ${stats.reviews}</p>
  `;
}

function renderSellerRevenue(list) {
  if (!sellerRevenueBox) return;

  if (list.length === 0) {
    sellerRevenueBox.innerHTML = "<p>No seller revenue yet.</p>";
    return;
  }

  sellerRevenueBox.innerHTML = list.slice(0, 8).map((seller) => `
    <p><strong>${escapeHtml(seller.name)}:</strong> Rs ${formatMoney(seller.amount)}</p>
  `).join("");
}

function renderDeliveryStatus(statusCounts) {
  if (!deliveryStatusBox) return;

  const entries = Object.entries(statusCounts);

  if (entries.length === 0) {
    deliveryStatusBox.innerHTML = "<p>No delivery data yet.</p>";
    return;
  }

  deliveryStatusBox.innerHTML = entries.map(([status, count]) => `
    <p><strong>${escapeHtml(status)}:</strong> ${count}</p>
  `).join("");
}

/* Charts */

function drawLineChart(canvas, data, key, label) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  const height = Number(canvas.getAttribute("height") || 180);

  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, width, height);

  const padding = 34;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const values = data.map((item) => Number(item[key] || 0));
  const max = Math.max(...values, 1);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padding + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.strokeStyle = key === "revenue" ? "#0f766e" : "#f59e0b";
  ctx.lineWidth = 3;

  data.forEach((item, index) => {
    const x = padding + (chartWidth / Math.max(data.length - 1, 1)) * index;
    const y = padding + chartHeight - (Number(item[key] || 0) / max) * chartHeight;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  data.forEach((item, index) => {
    const x = padding + (chartWidth / Math.max(data.length - 1, 1)) * index;
    const y = padding + chartHeight - (Number(item[key] || 0) / max) * chartHeight;

    ctx.beginPath();
    ctx.fillStyle = key === "revenue" ? "#14b8a6" : "#fbbf24";
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6b7280";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(item.label, x, height - 8);
  });

  ctx.fillStyle = "#111827";
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  ctx.fillText(label, padding, 16);
}

function drawPieChart(canvas, counts) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  const height = Number(canvas.getAttribute("height") || 180);

  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, width, height);

  const entries = Object.entries(counts || {});
  if (!entries.length) {
    drawEmptyChart(ctx, width, height, "No data yet");
    return;
  }

  const total = entries.reduce((sum, entry) => sum + Number(entry[1] || 0), 0);
  const colors = ["#0f766e", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];

  const cx = width / 2 - 80;
  const cy = height / 2;
  const radius = Math.min(width, height) / 3;

  let start = -Math.PI / 2;

  entries.forEach(([label, count], index) => {
    const slice = (Number(count || 0) / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();

    start += slice;
  });

  entries.forEach(([label, count], index) => {
    const y = 36 + index * 24;

    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(width - 170, y - 10, 12, 12);

    ctx.fillStyle = "#111827";
    ctx.font = "12px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${label}: ${count}`, width - 150, y);
  });
}

function drawEmptyChart(ctx, width, height, message) {
  ctx.fillStyle = "#6b7280";
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

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0
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

function renderError(message) {
  if (recentOrders) {
    recentOrders.innerHTML = `
      <div class="order-card">
        <h3>Could not load admin analytics</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}
