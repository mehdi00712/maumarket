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

const dashboardMenuBtn = document.getElementById("dashboardMenuBtn");
const dashboardNav = document.getElementById("dashboardNav");
const dashboardSearchInput = document.getElementById("dashboardSearchInput");
const dashboardSearchBtn = document.getElementById("dashboardSearchBtn");

dashboardMenuBtn?.addEventListener("click", () => {
  dashboardNav?.classList.toggle("show");
});

dashboardSearchBtn?.addEventListener("click", () => {
  const search = dashboardSearchInput?.value?.trim() || "";
  window.location.href = search
    ? `products.html?search=${encodeURIComponent(search)}`
    : "products.html";
});

dashboardSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();

    const search = dashboardSearchInput.value.trim();
    window.location.href = search
      ? `products.html?search=${encodeURIComponent(search)}`
      : "products.html";
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

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      roleBadge.textContent = "Error";
      welcome.textContent = "Profile missing";
      statusText.textContent = "User profile not found.";
      actions.innerHTML = "";
      quickStats.innerHTML = "";
      return;
    }

    const data = snap.data();

    if (data.blocked === true) {
      roleBadge.textContent = "Blocked";
      welcome.textContent = "Account blocked";
      statusText.textContent = "Your account has been blocked. Please contact MauMarket.";
      actions.innerHTML = "";
      quickStats.innerHTML = "";
      return;
    }

    welcome.textContent = `Welcome, ${data.name || "User"}`;

    if (data.role === "admin") {
      await renderAdminDashboard();
      return;
    }

    if (data.role === "seller") {
      if (!data.approved) {
        renderPendingSeller();
        return;
      }

      await renderSellerDashboard(user.uid, data);
      return;
    }

    if (data.role === "delivery") {
      if (!data.approved) {
        renderPendingDelivery();
        return;
      }

      await renderDeliveryDashboard(user.uid);
      return;
    }

    await renderCustomerDashboard(user.uid);
  } catch (error) {
    roleBadge.textContent = "Error";
    welcome.textContent = "Dashboard error";
    statusText.textContent = error.message;
    actions.innerHTML = "";
    quickStats.innerHTML = "";
  }
});

async function renderCustomerDashboard(uid) {
  roleBadge.textContent = "Customer";
  statusText.textContent = "Shop local products, manage orders, wishlist items, and track deliveries.";

  const cartSnap = await getDocs(collection(db, "carts", uid, "items"));

  const wishlistSnap = await getDocs(
    collection(db, "wishlists", uid, "items")
  );

  const ordersQ = query(
    collection(db, "orders"),
    where("customerId", "==", uid)
  );

  const ordersSnap = await getDocs(ordersQ);

  let activeOrders = 0;
  let deliveredOrders = 0;

  ordersSnap.forEach((docSnap) => {
    const order = docSnap.data();

    if (order.orderStatus === "Delivered") deliveredOrders++;

    if (
      order.orderStatus !== "Delivered" &&
      order.orderStatus !== "Cancelled"
    ) {
      activeOrders++;
    }
  });

  quickStats.innerHTML = `
    ${statCard(cartSnap.size, "Cart Items")}
    ${statCard(wishlistSnap.size, "Wishlist")}
    ${statCard(activeOrders, "Active Orders")}
    ${statCard(deliveredOrders, "Delivered")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🛒", "Marketplace", "Browse products and services from local sellers.", "products.html")}
    ${dashboardCard("❤️", "Wishlist", "Save products and services for later.", "wishlist.html")}
    ${dashboardCard("🧺", "My Cart", "Review your selected items before checkout.", "cart.html")}
    ${dashboardCard("📦", "My Orders", "Track deliveries and leave verified reviews.", "my-orders.html")}
    ${dashboardCard("⭐", "Reviews", "Read and manage marketplace reviews.", "reviews.html")}
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

  let activeProducts = 0;
  let deliveredOrders = 0;

  productsSnap.forEach((docSnap) => {
    const product = docSnap.data();
    if (product.active === true) activeProducts++;
  });

  ordersSnap.forEach((docSnap) => {
    const order = docSnap.data();
    if (order.orderStatus === "Delivered") deliveredOrders++;
  });

  quickStats.innerHTML = `
    ${statCard(`${productsSnap.size}/${productLimit}`, "Product Slots")}
    ${statCard(activeProducts, "Visible Products")}
    ${statCard(ordersSnap.size, "Seller Orders")}
    ${statCard(deliveredOrders, "Delivered")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🏪", "Seller Dashboard", "Create your shop profile and manage products.", "seller.html")}
    ${dashboardCard("📦", "Seller Orders", "View customer orders for your products.", "seller-orders.html")}
    ${dashboardCard("💰", "Earnings", "Track your sales, commission, and payouts.", "seller-earnings.html")}
    ${dashboardCard("📊", "Analytics", "See your products, reviews, and performance.", "seller-analytics.html")}
    ${dashboardCard("🎯", "Slot Requests", "Request more product slots when your shop grows.", "seller.html")}
    ${dashboardCard("🛍️", "Marketplace", "See how your shop appears to customers.", "products.html")}
  `;
}

async function renderDeliveryDashboard(uid) {
  roleBadge.textContent = "Delivery";
  statusText.textContent = "Manage assigned deliveries, collect customer signatures, and submit completed deliveries.";

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
    console.error("Delivery jobs stats error:", error.message);
  }

  quickStats.innerHTML = `
    ${statCard(assigned, "Assigned")}
    ${statCard(active, "Active")}
    ${statCard(pickedUp, "Picked Up")}
    ${statCard(outForDelivery, "Out")}
    ${statCard(submitted, "Submitted")}
    ${statCard(delivered, "Delivered")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🛵", "Delivery Dashboard", "View assigned deliveries and collect customer signatures.", "delivery.html")}
    ${dashboardCard("✅", "Completed Deliveries", "See deliveries after admin validation.", "delivery.html")}
    ${dashboardCard("📦", "Marketplace", "Browse MauMarket products.", "products.html")}
  `;
}

async function renderAdminDashboard() {
  roleBadge.textContent = "Admin";
  statusText.textContent = "Manage sellers, payments, delivery, products, banners, payouts, and analytics.";

  let usersCount = 0;
  let productsCount = 0;
  let ordersCount = 0;
  let pendingSellers = 0;

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const productsSnap = await getDocs(collection(db, "products"));
    const ordersSnap = await getDocs(collection(db, "orders"));

    usersCount = usersSnap.size;
    productsCount = productsSnap.size;
    ordersCount = ordersSnap.size;

    usersSnap.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.role === "seller" && user.approved !== true) {
        pendingSellers++;
      }
    });
  } catch (error) {
    console.warn("Admin stats unavailable:", error.message);
  }

  quickStats.innerHTML = `
    ${statCard(usersCount, "Users")}
    ${statCard(productsCount, "Products")}
    ${statCard(ordersCount, "Orders")}
    ${statCard(pendingSellers, "Pending Sellers")}
  `;

  actions.innerHTML = `
    ${dashboardCard("🛡️", "Admin Dashboard", "Open the full MauMarket control center.", "admin.html")}
    ${dashboardCard("💳", "Payments", "Verify Juice payment screenshots.", "admin-payments.html")}
    ${dashboardCard("🚚", "Delivery Management", "Assign drivers and validate customer signatures.", "admin-delivery.html")}
    ${dashboardCard("📊", "Analytics", "View marketplace statistics.", "admin-analytics.html")}
    ${dashboardCard("💰", "Commission", "Track platform revenue and seller payouts.", "admin-commission.html")}
    ${dashboardCard("🏦", "Payouts", "Mark seller payouts as paid.", "admin-payouts.html")}
    ${dashboardCard("👥", "Users", "Approve, block, or manage users.", "admin-users.html")}
    ${dashboardCard("🛍️", "Products", "Hide or delete bad products.", "admin-products.html")}
    ${dashboardCard("🎯", "Ad Banners", "Manage paid featured shop banners.", "admin-banners.html")}
    ${dashboardCard("📦", "Slot Requests", "Approve sellers requesting more product slots.", "admin-quota.html")}
  `;
}

function renderPendingSeller() {
  roleBadge.textContent = "Seller Pending";
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
  statusText.textContent = "Your delivery account is waiting for admin approval.";
  quickStats.innerHTML = "";

  actions.innerHTML = `
    <div class="dashboard-card">
      <div class="dash-icon">⏳</div>
      <h3>Waiting for Approval</h3>
      <p>Admin needs to approve your delivery account before you can receive assigned deliveries.</p>
      <span>Pending</span>
    </div>
  `;
}

function statCard(value, label) {
  return `
    <div class="dash-stat">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
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
