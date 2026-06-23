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

const sellerProducts = document.getElementById("sellerProducts");
const sellerOrders = document.getElementById("sellerOrders");
const sellerRevenue = document.getElementById("sellerRevenue");
const sellerRatingAvg = document.getElementById("sellerRatingAvg");
const sellerReviews = document.getElementById("sellerReviews");

const sellerDeliveredOrders = document.getElementById("sellerDeliveredOrders");
const sellerPendingOrders = document.getElementById("sellerPendingOrders");
const sellerAverageOrder = document.getElementById("sellerAverageOrder");
const sellerReviewCount = document.getElementById("sellerReviewCount");

const sellerBadge = document.getElementById("sellerBadge");
const sellerPerformanceSummary = document.getElementById("sellerPerformanceSummary");
const bestProductsBox = document.getElementById("bestProductsBox");
const recentOrdersBox = document.getElementById("recentOrdersBox");
const orderStatusBox = document.getElementById("orderStatusBox");
const productRevenueBox = document.getElementById("productRevenueBox");
const reviewSummaryText = document.getElementById("reviewSummaryText");

let currentUser = null;

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

async function loadSellerAnalytics() {
  const products = await loadSellerProducts();
  const orders = await loadSellerOrdersSafely();
  const reviews = await loadSellerReviewsSafely();

  const stats = calculateStats(products, orders, reviews);

  updateMainCards(stats);
  renderPerformanceSummary(stats);
  renderBestProducts(stats.bestProducts);
  renderRecentOrders(stats.verifiedOrders);
  renderOrderStatusBreakdown(stats.statusCounts);
  renderProductRevenue(stats.productRevenueList);
  renderReviews(reviews, stats);
}

async function loadSellerProducts() {
  const products = [];

  try {
    const productsQ = query(
      collection(db, "products"),
      where("sellerId", "==", currentUser.uid)
    );

    const productsSnap = await getDocs(productsQ);

    productsSnap.forEach((docSnap) => {
      products.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
  } catch (error) {
    console.warn("Products analytics unavailable:", error.message);
  }

  return products;
}

async function loadSellerOrdersSafely() {
  const orders = [];

  try {
    const ordersQ = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", currentUser.uid)
    );

    const ordersSnap = await getDocs(ordersQ);

    ordersSnap.forEach((docSnap) => {
      orders.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    return orders;
  } catch (error) {
    console.warn("Seller filtered orders unavailable. Trying safe fallback...");
  }

  try {
    const allOrdersSnap = await getDocs(collection(db, "orders"));

    allOrdersSnap.forEach((docSnap) => {
      const order = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if ((order.sellerIds || []).includes(currentUser.uid)) {
        orders.push(order);
      }
    });
  } catch (error) {
    console.warn("Orders analytics unavailable:", error.message);
  }

  return orders;
}

async function loadSellerReviewsSafely() {
  const reviews = [];

  try {
    const reviewsSnap = await getDocs(collection(db, "reviews"));

    reviewsSnap.forEach((docSnap) => {
      const review = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if ((review.sellerIds || []).includes(currentUser.uid)) {
        reviews.push(review);
      }
    });
  } catch (error) {
    console.warn("Reviews analytics unavailable:", error.message);
  }

  return reviews;
}

function calculateStats(products, orders, reviews) {
  const verifiedOrders = [];
  let revenue = 0;
  let deliveredOrders = 0;
  let pendingOrders = 0;

  const statusCounts = {};
  const productSalesMap = {};
  const productRevenueMap = {};

  orders.forEach((order) => {
    const status = order.orderStatus || "Unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (order.orderStatus === "Delivered") deliveredOrders++;

    if (
      order.orderStatus !== "Delivered" &&
      order.orderStatus !== "Cancelled"
    ) {
      pendingOrders++;
    }

    if (order.paymentStatus !== "verified") return;

    verifiedOrders.push(order);

    (order.items || []).forEach((item) => {
      if (item.sellerId !== currentUser.uid) return;

      const title = item.title || "Untitled";
      const qty = Number(item.quantity || 1);
      const subtotal = Number(item.price || 0) * qty;

      revenue += subtotal;

      productSalesMap[title] = (productSalesMap[title] || 0) + qty;
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

  reviews.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  verifiedOrders.sort((a, b) => {
    return (b.createdAt?.seconds || b.updatedAt?.seconds || 0) -
      (a.createdAt?.seconds || a.updatedAt?.seconds || 0);
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

  return {
    products,
    orders,
    reviews,
    verifiedOrders,
    revenue,
    deliveredOrders,
    pendingOrders,
    averageRating,
    averageDeliveryRating,
    averageOrderValue,
    bestProducts,
    productRevenueList,
    statusCounts
  };
}

function updateMainCards(stats) {
  sellerProducts.textContent = stats.products.length;
  sellerOrders.textContent = stats.verifiedOrders.length;
  sellerRevenue.textContent = `Rs ${formatMoney(stats.revenue)}`;
  sellerRatingAvg.textContent = stats.averageRating
    ? stats.averageRating.toFixed(1)
    : "0.0";

  if (sellerDeliveredOrders) sellerDeliveredOrders.textContent = stats.deliveredOrders;
  if (sellerPendingOrders) sellerPendingOrders.textContent = stats.pendingOrders;
  if (sellerAverageOrder) sellerAverageOrder.textContent = `Rs ${formatMoney(stats.averageOrderValue)}`;
  if (sellerReviewCount) sellerReviewCount.textContent = stats.reviews.length;
}

function renderPerformanceSummary(stats) {
  const badge = getSellerBadge(stats);

  if (sellerBadge) sellerBadge.textContent = badge;
  if (!sellerPerformanceSummary) return;

  sellerPerformanceSummary.innerHTML = `
    <div class="review-benefits">
      <div class="review-benefit">
        <span>🏆</span>
        <strong>${badge}</strong>
        <p class="muted">Seller status</p>
      </div>

      <div class="review-benefit">
        <span>⭐</span>
        <strong>${stats.averageRating ? stats.averageRating.toFixed(1) : "0.0"}</strong>
        <p class="muted">Seller rating</p>
      </div>

      <div class="review-benefit">
        <span>🚚</span>
        <strong>${stats.averageDeliveryRating ? stats.averageDeliveryRating.toFixed(1) : "0.0"}</strong>
        <p class="muted">Delivery rating</p>
      </div>

      <div class="review-benefit">
        <span>💰</span>
        <strong>Rs ${formatMoney(stats.averageOrderValue)}</strong>
        <p class="muted">Average order value</p>
      </div>
    </div>
  `;
}

function renderBestProducts(bestProducts) {
  if (!bestProductsBox) return;

  if (bestProducts.length === 0) {
    bestProductsBox.innerHTML = `
      <div class="order-card">
        <h3>No sales yet</h3>
        <p class="muted">Best selling products will appear after verified orders.</p>
      </div>
    `;
    return;
  }

  bestProductsBox.innerHTML = bestProducts.slice(0, 5).map((item, index) => `
    <div class="order-card">
      <h3>#${index + 1} ${escapeHtml(item.title)}</h3>
      <p><strong>Sold:</strong> ${item.sold}</p>
      <p><strong>Revenue:</strong> Rs ${formatMoney(item.revenue)}</p>
    </div>
  `).join("");
}

function renderRecentOrders(orders) {
  if (!recentOrdersBox) return;

  if (orders.length === 0) {
    recentOrdersBox.innerHTML = `
      <div class="order-card">
        <h3>No verified orders yet</h3>
        <p class="muted">Recent orders will appear once payments are verified.</p>
      </div>
    `;
    return;
  }

  recentOrdersBox.innerHTML = orders.slice(0, 5).map((order) => {
    const sellerItems = (order.items || []).filter((item) => {
      return item.sellerId === currentUser.uid;
    });

    const total = sellerItems.reduce((sum, item) => {
      return sum + Number(item.price || 0) * Number(item.quantity || 1);
    }, 0);

    return `
      <div class="order-card">
        <h3>Order #${escapeHtml(String(order.id).slice(0, 8))}</h3>
        <p><strong>Customer:</strong> ${escapeHtml(order.customerName || "Customer")}</p>
        <p><strong>Status:</strong> ${escapeHtml(order.orderStatus || "Pending")}</p>
        <p><strong>Seller Total:</strong> Rs ${formatMoney(total)}</p>
      </div>
    `;
  }).join("");
}

function renderOrderStatusBreakdown(statusCounts) {
  if (!orderStatusBox) return;

  const entries = Object.entries(statusCounts);

  if (entries.length === 0) {
    orderStatusBox.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  orderStatusBox.innerHTML = entries.map(([status, count]) => `
    <p><strong>${escapeHtml(status)}:</strong> ${count}</p>
  `).join("");
}

function renderProductRevenue(productRevenueList) {
  if (!productRevenueBox) return;

  if (productRevenueList.length === 0) {
    productRevenueBox.innerHTML = "<p>No product revenue yet.</p>";
    return;
  }

  productRevenueBox.innerHTML = productRevenueList.slice(0, 6).map((item) => `
    <p>
      <strong>${escapeHtml(item.title)}:</strong>
      Rs ${formatMoney(item.amount)}
    </p>
  `).join("");
}

function renderReviews(reviews, stats) {
  if (reviewSummaryText) {
    reviewSummaryText.textContent =
      `${reviews.length} review(s) • ${stats.averageRating ? stats.averageRating.toFixed(1) : "0.0"} ⭐`;
  }

  if (!sellerReviews) return;

  if (reviews.length === 0) {
    sellerReviews.innerHTML = `
      <div class="order-card">
        <h3>No reviews yet</h3>
        <p>Your customer reviews will appear here after delivered orders are reviewed.</p>
      </div>
    `;
    return;
  }

  sellerReviews.innerHTML = "";

  reviews.forEach((review) => {
    const sellerRating = Number(review.sellerRating || review.rating || 0);
    const deliveryRating = Number(review.deliveryRating || 0);

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>${stars(sellerRating)} ${sellerRating.toFixed(1)} Seller</h3>
      <p><strong>Customer:</strong> ${escapeHtml(review.customerName || "Customer")}</p>
      <p>${escapeHtml(review.reviewText || "")}</p>
      <p class="muted">
        Delivery:
        ${
          deliveryRating > 0
            ? `${stars(deliveryRating)} ${deliveryRating.toFixed(1)}`
            : "Not rated"
        }
      </p>
      <p class="muted">Verified Purchase</p>
    `;

    sellerReviews.appendChild(div);
  });
}

function getSellerBadge(stats) {
  if (stats.averageRating >= 4.8 && stats.reviews.length >= 10) {
    return "🏆 Top Rated Seller";
  }

  if (stats.averageRating >= 4.5 && stats.reviews.length >= 3) {
    return "⭐ Trusted Seller";
  }

  if (stats.verifiedOrders.length >= 5) {
    return "📈 Rising Seller";
  }

  if (stats.products.length > 0) {
    return "✅ Active Seller";
  }

  return "New Seller";
}

function showError(message) {
  if (sellerReviews) {
    sellerReviews.innerHTML = `
      <div class="order-card">
        <h3>Could not load seller analytics</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}

function stars(value) {
  const rating = Math.max(1, Math.min(5, Math.round(Number(value || 0))));
  return "⭐".repeat(rating);
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
