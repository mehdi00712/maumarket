import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const welcome = document.getElementById("welcome");
const statusText = document.getElementById("status");
const actions = document.getElementById("actions");
const roleBadge = document.getElementById("roleBadge");
const quickStats = document.getElementById("quickStats");

const logoutBtn = document.getElementById("logoutBtn");
const dashboardSearchInput = document.getElementById("dashboardSearchInput");
const dashboardSearchBtn = document.getElementById("dashboardSearchBtn");

dashboardSearchBtn?.addEventListener("click", searchMarketplace);

dashboardSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchMarketplace();
  }
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  renderLoading();

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      renderError(
        "Profile missing",
        "Your MauMarket profile was not found. Please contact support."
      );
      return;
    }

    const data = snap.data();

    if (data.blocked === true) {
      renderBlocked();
      return;
    }

    welcome.textContent = `Welcome, ${data.name || data.fullName || "MauMarket User"}`;

    if (data.role === "admin") {
      await renderAdminDashboard();
      return;
    }

    if (data.role === "seller") {
      if (data.approved !== true) {
        renderPendingSeller();
        return;
      }

      await renderSellerDashboard(user.uid, data);
      return;
    }

    if (data.role === "delivery") {
      if (data.approved !== true) {
        renderPendingDelivery();
        return;
      }

      await renderDeliveryDashboard(user.uid);
      return;
    }

    await renderCustomerDashboard(user.uid);
  } catch (error) {
    renderError("Dashboard error", error.message);
  }
});

function searchMarketplace() {
  const search = dashboardSearchInput?.value?.trim() || "";

  window.location.href = search
    ? `products.html?search=${encodeURIComponent(search)}`
    : "products.html";
}

function renderLoading() {
  roleBadge.textContent = "Loading";
  welcome.textContent = "Loading dashboard...";
  statusText.textContent = "Preparing your MauMarket control center.";

  quickStats.innerHTML = `
    ${statCard("...", "Loading")}
    ${statCard("...", "Loading")}
    ${statCard("...", "Loading")}
    ${statCard("...", "Loading")}
  `;

  actions.innerHTML = `
    <div class="dashboard-card">
      <div class="dash-icon">⏳</div>
      <h3>Loading</h3>
      <p>Please wait while we prepare your dashboard.</p>
      <span>Loading...</span>
    </div>
  `;
}

function renderError(title, message) {
  roleBadge.textContent = "Error";
  welcome.textContent = title;
  statusText.textContent = message;

  quickStats.innerHTML = "";

  actions.innerHTML = `
    <div class="dashboard-card">
      <div class="dash-icon">⚠️</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <span>Contact Support</span>
    </div>
  `;
}

function renderBlocked() {
  roleBadge.textContent = "Blocked";
  welcome.textContent = "Account blocked";
  statusText.textContent = "Your account has been blocked. Please contact MauMarket support.";

  quickStats.innerHTML = "";

  actions.innerHTML = `
    <div class="dashboard-card">
      <div class="dash-icon">🚫</div>
      <h3>Account blocked</h3>
      <p>You cannot use MauMarket services while your account is blocked.</p>
      <span>Contact Support</span>
    </div>
  `;
}

async function renderCustomerDashboard(uid) {
  roleBadge.textContent = "Buyer Account";
  statusText.textContent = "Shop local products, manage your wishlist, track orders, and complete checkout securely.";

  let cartCount = 0;
  let wishlistCount = 0;
  let activeOrders = 0;
  let deliveredOrders = 0;

  try {
    const cartSnap = await getDocs(collection(db, "carts", uid, "items"));
    cartCount = cartSnap.size;
  } catch (error) {
    console.warn("Cart stats unavailable:", error.message);
  }

  try {
    const wishlistSnap = await getDocs(collection(db, "wishlists", uid, "items"));
    wishlistCount = wishlistSnap.size;
  } catch (error) {
    console.warn("Wishlist stats unavailable:", error.message);
  }

  try {
    const ordersQ = query(
      collection(db, "orders"),
      where("customerId", "==", uid)
    );

    const ordersSnap = await getDocs(ordersQ);

    ordersSnap.forEach((docSnap) => {
      const order = docSnap.data();
      const status = order.orderStatus || "";

      if (status === "Delivered") {
        deliveredOrders++;
      }

      if (status !== "Delivered" && status !== "Cancelled") {
        activeOrders++;
      }
    });
  } catch (error) {
    console.warn("Order stats unavailable:", error.message);
  }

  quickStats.innerHTML = `
    ${statCard(cartCount, "Cart Items", "🛒")}
    ${statCard(wishlistCount, "Wishlist", "❤️")}
    ${statCard(activeOrders, "Active Orders", "📦")}
    ${statCard(deliveredOrders, "Delivered", "✅")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🛍️", "Marketplace", "Browse products and services from trusted local sellers.", "products.html")}
    ${dashboardCard("❤️", "Wishlist", "View products and services you saved for later.", "wishlist.html")}
    ${dashboardCard("🧺", "My Cart", "Review your selected items before checkout.", "cart.html")}
    ${dashboardCard("📦", "My Orders", "Track your payment, delivery, and order progress.", "my-orders.html")}
  `;
}

async function renderSellerDashboard(uid, data) {
  roleBadge.textContent = "Seller Account";
  statusText.textContent = "Manage your shop, listings, orders, earnings, and analytics.";

  let productCount = 0;
  let activeProducts = 0;
  let sellerOrders = 0;
  let deliveredOrders = 0;

  const productLimit = Number(data.productLimit || 50);

  try {
    const productsQ = query(
      collection(db, "products"),
      where("sellerId", "==", uid)
    );

    const productsSnap = await getDocs(productsQ);

    productCount = productsSnap.size;

    productsSnap.forEach((docSnap) => {
      const product = docSnap.data();

      if (product.active === true) {
        activeProducts++;
      }
    });
  } catch (error) {
    console.warn("Seller product stats unavailable:", error.message);
  }

  try {
    const ordersQ = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", uid)
    );

    const ordersSnap = await getDocs(ordersQ);

    sellerOrders = ordersSnap.size;

    ordersSnap.forEach((docSnap) => {
      const order = docSnap.data();

      if (order.orderStatus === "Delivered") {
        deliveredOrders++;
      }
    });
  } catch (error) {
    console.warn("Seller order stats unavailable:", error.message);
  }

  quickStats.innerHTML = `
    ${statCard(`${productCount}/${productLimit}`, "Product Slots", "🎯")}
    ${statCard(activeProducts, "Visible Listings", "🛍️")}
    ${statCard(sellerOrders, "Orders", "📦")}
    ${statCard(deliveredOrders, "Delivered", "✅")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🏪", "Seller Dashboard", "Create your shop profile and manage products or services.", "seller.html")}
    ${dashboardCard("📦", "Seller Orders", "View orders placed for your products.", "seller-orders.html")}
    ${dashboardCard("💰", "Earnings", "Track sales, payouts, and platform commission.", "seller-earnings.html")}
    ${dashboardCard("📊", "Analytics", "Review product performance and customer activity.", "seller-analytics.html")}
    ${dashboardCard("🛍️", "Marketplace", "See how your shop appears to buyers.", "products.html")}
  `;
}

async function renderDeliveryDashboard(uid) {
  roleBadge.textContent = "Delivery Account";
  statusText.textContent = "Manage assigned deliveries, pickups, customer signatures, and completed orders.";

  let assigned = 0;
  let active = 0;
  let pickedUp = 0;
  let outForDelivery = 0;
  let submitted = 0;
  let delivered = 0;

  try {
    const jobsQ = query(
      collection(db, "deliveryJobs"),
      where("driverId", "==", uid)
    );

    const jobsSnap = await getDocs(jobsQ);

    assigned = jobsSnap.size;

    jobsSnap.forEach((docSnap) => {
      const job = docSnap.data();
      const status = job.orderStatus || "";

      if (status === "Picked Up") pickedUp++;
      if (status === "Out for Delivery") outForDelivery++;
      if (status === "Delivery Submitted") submitted++;
      if (status === "Delivered") delivered++;

      if (
        status !== "Delivered" &&
        status !== "Cancelled" &&
        job.active !== false
      ) {
        active++;
      }
    });
  } catch (error) {
    console.warn("Delivery jobs stats unavailable:", error.message);
  }

  quickStats.innerHTML = `
    ${statCard(assigned, "Assigned", "📦")}
    ${statCard(active, "Active", "⚡")}
    ${statCard(pickedUp, "Picked Up", "✅")}
    ${statCard(outForDelivery, "Out", "🚚")}
    ${statCard(submitted, "Submitted", "📝")}
    ${statCard(delivered, "Delivered", "🎉")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🛵", "Delivery Dashboard", "View assigned deliveries and collect customer signatures.", "delivery.html")}
    ${dashboardCard("✅", "Completed Deliveries", "Review deliveries after admin validation.", "delivery.html")}
    ${dashboardCard("🛍️", "Marketplace", "Browse MauMarket products.", "products.html")}
  `;
}

async function renderAdminDashboard() {
  roleBadge.textContent = "Admin Account";
  statusText.textContent = "Manage sellers, buyers, products, payments, deliveries, reviews, categories, payouts, and analytics.";

  let usersCount = 0;
  let productsCount = 0;
  let ordersCount = 0;
  let pendingSellers = 0;

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    usersCount = usersSnap.size;

    usersSnap.forEach((docSnap) => {
      const user = docSnap.data();

      if (user.role === "seller" && user.approved !== true) {
        pendingSellers++;
      }
    });
  } catch (error) {
    console.warn("Admin users stats unavailable:", error.message);
  }

  try {
    const productsSnap = await getDocs(collection(db, "products"));
    productsCount = productsSnap.size;
  } catch (error) {
    console.warn("Admin products stats unavailable:", error.message);
  }

  try {
    const ordersSnap = await getDocs(collection(db, "orders"));
    ordersCount = ordersSnap.size;
  } catch (error) {
    console.warn("Admin orders stats unavailable:", error.message);
  }

  quickStats.innerHTML = `
    ${statCard(usersCount, "Users", "👥")}
    ${statCard(productsCount, "Products", "🛍️")}
    ${statCard(ordersCount, "Orders", "📦")}
    ${statCard(pendingSellers, "Pending Sellers", "⏳")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🛡️", "Admin Dashboard", "Open the full MauMarket control center.", "admin.html")}
    ${dashboardCard("👥", "Users", "Approve, block, or manage users.", "admin-users.html")}
    ${dashboardCard("🛍️", "Products", "Hide, review, or delete marketplace products.", "admin-products.html")}
    ${dashboardCard("💳", "Payments", "Verify Juice payment screenshots.", "admin-payments.html")}
    ${dashboardCard("🚚", "Delivery", "Assign drivers and validate deliveries.", "admin-delivery.html")}
    ${dashboardCard("💰", "Commission", "Track platform revenue and seller payouts.", "admin-commission.html")}
    ${dashboardCard("🏦", "Payouts", "Mark seller payouts as paid.", "admin-payouts.html")}
    ${dashboardCard("⭐", "Reviews", "Moderate customer reviews and ratings.", "admin-reviews.html")}
    ${dashboardCard("🏷️", "Categories", "Create, edit, feature, hide, and delete categories.", "admin-categories.html")}
    ${dashboardCard("🎯", "Ad Banners", "Manage paid featured shop banners.", "admin-banners.html")}
    ${dashboardCard("📦", "Slot Requests", "Approve sellers requesting more product slots.", "admin-quota.html")}
  `;
}

function renderPendingSeller() {
  roleBadge.textContent = "Seller Pending";
  welcome.textContent = "Seller account pending";
  statusText.textContent = "Your seller account is waiting for admin approval.";

  quickStats.innerHTML = "";

  actions.innerHTML = `
    <div class="dashboard-card">
      <div class="dash-icon">⏳</div>
      <h3>Waiting for Approval</h3>
      <p>Admin needs to approve your seller account before you can create your shop.</p>
      <span>Pending</span>
    </div>

    ${dashboardCard("🛍️", "Browse Marketplace", "You can still browse products while waiting.", "products.html")}
  `;
}

function renderPendingDelivery() {
  roleBadge.textContent = "Delivery Pending";
  welcome.textContent = "Delivery account pending";
  statusText.textContent = "Your delivery account is waiting for admin approval.";

  quickStats.innerHTML = "";

  actions.innerHTML = `
    <div class="dashboard-card">
      <div class="dash-icon">⏳</div>
      <h3>Waiting for Approval</h3>
      <p>Admin needs to approve your delivery account before you can receive deliveries.</p>
      <span>Pending</span>
    </div>
  `;
}

function statCard(value, label, icon = "📊") {
  return `
    <div class="dash-stat">
      <div class="dash-stat-icon">${icon}</div>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function dashboardCard(icon, title, description, link) {
  return `
    <a class="dashboard-card" href="${escapeHtml(link)}">
      <div class="dash-icon">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <span>Open →</span>
    </a>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
