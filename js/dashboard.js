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
const logoutBtn = document.getElementById("logoutBtn");
const roleBadge = document.getElementById("roleBadge");
const quickStats = document.getElementById("quickStats");

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));

  if (!snap.exists()) {
    statusText.textContent = "User profile not found.";
    return;
  }

  const data = snap.data();

  if (data.blocked === true) {
    statusText.textContent = "Your account has been blocked. Please contact MauMarket.";
    actions.innerHTML = "";
    quickStats.innerHTML = "";
    return;
  }

  welcome.textContent = `Welcome, ${data.name || "User"}`;

  if (data.role === "admin") {
    renderAdminDashboard();
    return;
  }

  if (data.role === "seller") {
    if (!data.approved) {
      roleBadge.textContent = "Seller Pending";
      statusText.textContent = "Your seller account is waiting for admin approval.";
      quickStats.innerHTML = "";
      actions.innerHTML = `
        <div class="dashboard-card">
          <div class="dash-icon">⏳</div>
          <h3>Waiting for Approval</h3>
          <p>Admin needs to approve your seller account before you can create your shop.</p>
        </div>
      `;
      return;
    }

    await renderSellerDashboard(user.uid, data);
    return;
  }

  await renderCustomerDashboard(user.uid);
});

async function renderCustomerDashboard(uid) {
  roleBadge.textContent = "Customer";
  statusText.textContent = "Shop local products, manage orders, and track deliveries.";

  const cartSnap = await getDocs(collection(db, "carts", uid, "items"));

  const ordersQ = query(
    collection(db, "orders"),
    where("customerId", "==", uid)
  );

  const ordersSnap = await getDocs(ordersQ);

  let activeOrders = 0;

  ordersSnap.forEach((docSnap) => {
    const order = docSnap.data();
    if (order.orderStatus !== "Delivered" && order.orderStatus !== "Cancelled") {
      activeOrders++;
    }
  });

  quickStats.innerHTML = `
    <div class="dash-stat">
      <strong>${cartSnap.size}</strong>
      <span>Cart Items</span>
    </div>

    <div class="dash-stat">
      <strong>${ordersSnap.size}</strong>
      <span>Total Orders</span>
    </div>

    <div class="dash-stat">
      <strong>${activeOrders}</strong>
      <span>Active Orders</span>
    </div>
  `;

  actions.innerHTML = `
    ${dashboardCard("🛒", "Marketplace", "Browse products and services from local sellers.", "products.html")}
    ${dashboardCard("🧺", "My Cart", "Review your selected items before checkout.", "cart.html")}
    ${dashboardCard("📦", "My Orders", "Track deliveries and leave verified reviews.", "my-orders.html")}
  `;
}

async function renderSellerDashboard(uid, data) {
  roleBadge.textContent = "Seller";
  statusText.textContent = "Manage your shop, products, orders, earnings, and analytics.";

  const productsQ = query(
    collection(db, "products"),
    where("sellerId", "==", uid)
  );

  const ordersQ = query(
    collection(db, "orders"),
    where("sellerIds", "array-contains", uid)
  );

  const productsSnap = await getDocs(productsQ);
  const ordersSnap = await getDocs(ordersQ);

  const productLimit = Number(data.productLimit || 50);

  quickStats.innerHTML = `
    <div class="dash-stat">
      <strong>${productsSnap.size}/${productLimit}</strong>
      <span>Product Slots</span>
    </div>

    <div class="dash-stat">
      <strong>${ordersSnap.size}</strong>
      <span>Seller Orders</span>
    </div>

    <div class="dash-stat">
      <strong>${data.approved ? "Approved" : "Pending"}</strong>
      <span>Seller Status</span>
    </div>
  `;

  actions.innerHTML = `
    ${dashboardCard("🏪", "Seller Dashboard", "Create your shop profile and manage products.", "seller.html")}
    ${dashboardCard("📦", "Seller Orders", "View customer orders for your products.", "seller-orders.html")}
    ${dashboardCard("💰", "Earnings", "Track your sales, commission, and payouts.", "seller-earnings.html")}
    ${dashboardCard("📊", "Analytics", "See your products, reviews, and performance.", "seller-analytics.html")}
    ${dashboardCard("🛍️", "Marketplace", "See how your shop appears to customers.", "products.html")}
  `;
}

function renderAdminDashboard() {
  roleBadge.textContent = "Admin";
  statusText.textContent = "Manage sellers, payments, delivery, products, banners, payouts, and analytics.";

  quickStats.innerHTML = `
    <div class="dash-stat">
      <strong>Admin</strong>
      <span>Control</span>
    </div>

    <div class="dash-stat">
      <strong>Live</strong>
      <span>Marketplace</span>
    </div>

    <div class="dash-stat">
      <strong>Secure</strong>
      <span>Management</span>
    </div>
  `;

  actions.innerHTML = `
    ${dashboardCard("🛡️", "Admin Dashboard", "Open the full MauMarket control center.", "admin.html")}
    ${dashboardCard("💳", "Payments", "Verify Juice payment screenshots.", "admin-payments.html")}
    ${dashboardCard("🚚", "Delivery", "Manage pickup and delivery tracking.", "admin-delivery.html")}
    ${dashboardCard("📊", "Analytics", "View marketplace statistics.", "admin-analytics.html")}
    ${dashboardCard("💰", "Commission", "Track platform revenue and seller payouts.", "admin-commission.html")}
    ${dashboardCard("🏦", "Payouts", "Mark seller payouts as paid.", "admin-payouts.html")}
    ${dashboardCard("👥", "Users", "Approve, block, or manage users.", "admin-users.html")}
    ${dashboardCard("🛍️", "Products", "Hide or delete bad products.", "admin-products.html")}
    ${dashboardCard("🎯", "Ad Banners", "Manage paid featured shop banners.", "admin-banners.html")}
    ${dashboardCard("📦", "Slot Requests", "Approve sellers requesting more product slots.", "admin-quota.html")}
  `;
}

function dashboardCard(icon, title, description, link) {
  return `
    <a class="dashboard-card" href="${link}">
      <div class="dash-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${description}</p>
      <span>Open →</span>
    </a>
  `;
}
