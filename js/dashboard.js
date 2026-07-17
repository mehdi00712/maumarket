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

/* ==========================================================
   MAUMARKET DASHBOARD
   Buyer / Merchant / Delivery / Admin
========================================================== */

const welcome = document.getElementById("welcome");
const statusText = document.getElementById("status");
const actions = document.getElementById("actions");
const roleBadge = document.getElementById("roleBadge");
const quickStats = document.getElementById("quickStats");
const accountStatusText = document.getElementById("accountStatusText");

const logoutBtn = document.getElementById("logoutBtn");

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
        "Your MauMarket profile was not found."
      );
      return;
    }

    const data = snap.data();

    if (accountStatusText) {
      accountStatusText.textContent =
        data.approved === false ? "Pending" : "Active";
    }

    if (data.blocked === true) {
      renderBlocked();
      return;
    }

    const displayName = data.name || data.fullName || "MauMarket User";
    welcome.textContent = `Welcome, ${displayName}`;

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

    await renderBuyerDashboard(user.uid);
  } catch (error) {
    console.error("Dashboard failed to load:", error);

    renderError(
      "Dashboard unavailable",
      getFriendlyDashboardError(
        error,
        "Your dashboard could not be loaded. Please refresh and try again."
      )
    );
  }
});

/* ==========================================================
   STATES
========================================================== */

function renderLoading() {
  roleBadge.textContent = "Loading";
  welcome.textContent = "Loading dashboard...";
  statusText.textContent = "Preparing your MauMarket account.";

  quickStats.innerHTML = `
    ${statCard("...", "Loading", "Please wait")}
    ${statCard("...", "Loading", "Please wait")}
    ${statCard("...", "Loading", "Please wait")}
    ${statCard("...", "Loading", "Please wait")}
  `;

  actions.innerHTML = `
    ${skeletonCard()}
    ${skeletonCard()}
    ${skeletonCard()}
    ${skeletonCard()}
  `;
}

function renderError(title, message) {
  roleBadge.textContent = "Error";
  welcome.textContent = title;
  statusText.textContent = message;
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard({
      label: "Error",
      title,
      description: message,
      link: "dashboard.html",
      actionText: "Retry"
    })}
  `;
}

function renderBlocked() {
  roleBadge.textContent = "Blocked";
  if (accountStatusText) accountStatusText.textContent = "Blocked";
  welcome.textContent = "Account blocked";
  statusText.textContent = "Your account has been blocked. Please contact MauMarket support.";
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard({
      label: "Blocked",
      title: "Account Blocked",
      description: "You cannot use MauMarket while your account is blocked.",
      link: "login.html",
      actionText: "Exit"
    })}
  `;
}

/* ==========================================================
   BUYER DASHBOARD
========================================================== */

async function renderBuyerDashboard(uid) {
  roleBadge.textContent = "Buyer Account";
  statusText.textContent = "Browse products, save favourites, checkout securely and track every MauMarket order.";

  let cartCount = 0;
  let wishlistCount = 0;
  let activeOrders = 0;
  let deliveredOrders = 0;

  try {
    const cartSnap = await getDocs(collection(db, "carts", uid, "items"));
    cartCount = cartSnap.size;
  } catch (error) {
    console.warn("Could not load cart count.");
  }

  try {
    const wishlistSnap = await getDocs(collection(db, "wishlists", uid, "items"));
    wishlistCount = wishlistSnap.size;
  } catch (error) {
    console.warn("Could not load wishlist count.");
  }

  try {
    const ordersQ = query(
      collection(db, "orders"),
      where("customerId", "==", uid)
    );

    const ordersSnap = await getDocs(ordersQ);

    ordersSnap.forEach((docSnap) => {
      const status = docSnap.data().orderStatus || "";

      if (status === "Delivered") {
        deliveredOrders++;
      }

      if (status !== "Delivered" && status !== "Cancelled") {
        activeOrders++;
      }
    });
  } catch (error) {
    console.warn("Could not load buyer orders.");
  }

  actions.innerHTML = `
    ${dashboardCard({
      label: "Business",
      title: "Marketplace",
      description: "Browse products and services from verified MauMarket merchants.",
      link: "products.html",
      actionText: "Shop Now"
    })}

    ${dashboardCard({
      label: "Wishlist",
      title: "Wishlist",
      description: "View the products and services you saved for later.",
      link: "wishlist.html",
      actionText: "View Wishlist"
    })}

    ${dashboardCard({
      label: "Cart",
      title: "Shopping Cart",
      description: "Review your selected items and continue to secure checkout.",
      link: "cart.html",
      actionText: "View Cart"
    })}

    ${dashboardCard({
      label: "Orders",
      title: "My Orders",
      description: "Track payment verification, delivery progress and completed orders.",
      link: "my-orders.html",
      actionText: "View Orders"
    })}
  `;

  quickStats.innerHTML = `
    ${statCard(cartCount, "Cart Items", "Items waiting for checkout")}
    ${statCard(wishlistCount, "Wishlist Items", "Saved products")}
    ${statCard(activeOrders, "Active Orders", "Orders still in progress")}
    ${statCard(deliveredOrders, "Delivered Orders", "Completed orders")}
  `;
}

/* ==========================================================
   SELLER DASHBOARD
========================================================== */

async function renderSellerDashboard(uid, data) {
  roleBadge.textContent = "Merchant Account";
  statusText.textContent = "Manage your private business profile, listings, orders, earnings and analytics.";

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
      if (docSnap.data().active === true) {
        activeProducts++;
      }
    });
  } catch (error) {
    console.warn("Could not load seller products.");
  }

  try {
    const ordersQ = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", uid)
    );

    const ordersSnap = await getDocs(ordersQ);
    sellerOrders = ordersSnap.size;

    ordersSnap.forEach((docSnap) => {
      if (docSnap.data().orderStatus === "Delivered") {
        deliveredOrders++;
      }
    });
  } catch (error) {
    console.warn("Could not load seller orders.");
  }

  actions.innerHTML = `
    ${dashboardCard({
      label: "Business",
      title: "Merchant Dashboard",
      description: "Manage your private business details, products, services and listings.",
      link: "seller.html",
      actionText: "Open Dashboard"
    })}

    ${dashboardCard({
      label: "Orders",
      title: "Merchant Orders",
      description: "View orders and prepare products for MauMarket collection.",
      link: "seller-orders.html",
      actionText: "Manage Orders"
    })}

    ${dashboardCard({
      label: "Earnings",
      title: "Merchant Earnings",
      description: "Track sales, payouts, commission and merchant income history.",
      link: "seller-earnings.html",
      actionText: "View Earnings"
    })}

    ${dashboardCard({
      label: "Analytics",
      title: "Merchant Analytics",
      description: "View listing performance, product statistics and order insights.",
      link: "seller-analytics.html",
      actionText: "View Analytics"
    })}

    ${dashboardCard({
      label: "Orders",
      title: "My Orders",
      description: "Track every order you placed as a buyer, even when you also sell on MauMarket.",
      link: "my-orders.html",
      actionText: "View My Orders"
    })}

    ${dashboardCard({
      label: "Market",
      title: "Marketplace",
      description: "View your public product listings in the MauMarket marketplace.",
      link: "products.html",
      actionText: "View Marketplace"
    })}
  `;

  quickStats.innerHTML = `
    ${statCard(`${productCount}/${productLimit}`, "Product Slots", "Used listing capacity")}
    ${statCard(activeProducts, "Active Listings", "Visible products and services")}
    ${statCard(sellerOrders, "Merchant Orders", "Orders linked to your business")}
    ${statCard(deliveredOrders, "Delivered Orders", "Completed customer orders")}
  `;
}

/* ==========================================================
   DELIVERY DASHBOARD
========================================================== */

async function renderDeliveryDashboard(uid) {
  roleBadge.textContent = "Delivery Account";
  statusText.textContent = "Manage assigned deliveries, customer signatures and completed drop-offs.";

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
    console.warn("Could not load delivery jobs.");
  }

  actions.innerHTML = `
    ${dashboardCard({
      label: "Delivery",
      title: "Delivery Dashboard",
      description: "View assigned deliveries, pinned locations and order progress.",
      link: "delivery.html",
      actionText: "Open Deliveries"
    })}

    ${dashboardCard({
      label: "Assigned",
      title: "Assigned Deliveries",
      description: "See pickups, customer information and delivery signatures.",
      link: "delivery.html",
      actionText: "View Assigned"
    })}

    ${dashboardCard({
      label: "Market",
      title: "Marketplace",
      description: "Browse MauMarket products and services.",
      link: "products.html",
      actionText: "View Marketplace"
    })}
  `;

  quickStats.innerHTML = `
    ${statCard(assigned, "Assigned Jobs", "All jobs assigned to you")}
    ${statCard(active, "Active Jobs", "Still in progress")}
    ${statCard(pickedUp, "Picked Up", "Collected from merchant")}
    ${statCard(outForDelivery, "Out For Delivery", "Currently delivering")}
    ${statCard(submitted, "Submitted", "Waiting admin validation")}
    ${statCard(delivered, "Delivered", "Completed deliveries")}
  `;
}

/* ==========================================================
   ADMIN DASHBOARD
========================================================== */

async function renderAdminDashboard() {
  roleBadge.textContent = "Admin Account";
  statusText.textContent = "Manage users, products, payments, delivery, payouts, analytics and platform operations.";

  let usersCount = 0;
  let productsCount = 0;
  let ordersCount = 0;
  let pendingMerchants = 0;

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    usersCount = usersSnap.size;

    usersSnap.forEach((docSnap) => {
      const user = docSnap.data();

      if (user.role === "seller" && user.approved !== true) {
        pendingMerchants++;
      }
    });
  } catch (error) {
    console.warn("Could not load users.");
  }

  try {
    const productsSnap = await getDocs(collection(db, "products"));
    productsCount = productsSnap.size;
  } catch (error) {
    console.warn("Could not load products.");
  }

  try {
    const ordersSnap = await getDocs(collection(db, "orders"));
    ordersCount = ordersSnap.size;
  } catch (error) {
    console.warn("Could not load orders.");
  }

  actions.innerHTML = `
    ${dashboardCard({
      label: "Control",
      title: "Admin Panel",
      description: "Open the main MauMarket control center.",
      link: "admin.html",
      actionText: "Open Admin"
    })}

    ${dashboardCard({
      label: "Accounts",
      title: "Users",
      description: "Manage buyers, merchants, delivery users and administrators.",
      link: "admin-users.html",
      actionText: "Manage Users"
    })}

    ${dashboardCard({
      label: "Catalog",
      title: "Products",
      description: "Review, hide, approve or remove marketplace listings.",
      link: "admin-products.html",
      actionText: "Manage Products"
    })}

    ${dashboardCard({
      label: "Finance",
      title: "Payments",
      description: "Verify Juice payment screenshots and view payment history.",
      link: "admin-payments.html",
      actionText: "Verify Payments"
    })}

    ${dashboardCard({
      label: "Logistics",
      title: "Delivery",
      description: "Assign drivers, schedule deliveries and validate drop-offs.",
      link: "admin-delivery.html",
      actionText: "Manage Delivery"
    })}

    ${dashboardCard({
      label: "Revenue",
      title: "Commission Dashboard",
      description: "Track MauMarket revenue, merchant amounts and commission.",
      link: "admin-commission.html",
      actionText: "View Commission"
    })}

    ${dashboardCard({
      label: "Merchants",
      title: "Payouts",
      description: "Manage merchant payout status and payout records.",
      link: "admin-payouts.html",
      actionText: "Manage Payouts"
    })}

    ${dashboardCard({
      label: "Trust",
      title: "Reviews",
      description: "Moderate customer reviews and ratings.",
      link: "admin-reviews.html",
      actionText: "Manage Reviews"
    })}

    ${dashboardCard({
      label: "Structure",
      title: "Categories",
      description: "Create and manage marketplace categories.",
      link: "admin-categories.html",
      actionText: "Manage Categories"
    })}

    ${dashboardCard({
      label: "Marketing",
      title: "Ad Banners",
      description: "Manage product promotions and marketplace banners.",
      link: "admin-banners.html",
      actionText: "Manage Banners"
    })}

    ${dashboardCard({
      label: "Requests",
      title: "Slot Requests",
      description: "Approve merchant requests for additional product slots.",
      link: "admin-quota.html",
      actionText: "Review Requests"
    })}

    ${dashboardCard({
      label: "Reports",
      title: "Admin Analytics",
      description: "View platform performance, revenue and reports.",
      link: "admin-analytics.html",
      actionText: "View Analytics"
    })}
  `;

  quickStats.innerHTML = `
    ${statCard(usersCount, "Users", "Registered platform accounts")}
    ${statCard(productsCount, "Products", "Products and services listed")}
    ${statCard(ordersCount, "Orders", "Orders placed on MauMarket")}
    ${statCard(pendingMerchants, "Pending Merchants", "Merchant approvals waiting")}
  `;
}

/* ==========================================================
   PENDING STATES
========================================================== */

function renderPendingSeller() {
  roleBadge.textContent = "Merchant Pending";
  if (accountStatusText) accountStatusText.textContent = "Pending";
  welcome.textContent = "Merchant account pending";
  statusText.textContent = "Your merchant account is waiting for admin approval.";
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard({
      label: "Pending",
      title: "Waiting for Approval",
      description: "Admin must approve your merchant account before you can publish listings.",
      link: "dashboard.html",
      actionText: "Check Status"
    })}

    ${dashboardCard({
      label: "Market",
      title: "Marketplace",
      description: "Browse products while waiting for approval.",
      link: "products.html",
      actionText: "Shop Now"
    })}
  `;
}

function renderPendingDelivery() {
  roleBadge.textContent = "Delivery Pending";
  if (accountStatusText) accountStatusText.textContent = "Pending";
  welcome.textContent = "Delivery account pending";
  statusText.textContent = "Your delivery account is waiting for admin approval.";
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard({
      label: "Pending",
      title: "Waiting for Approval",
      description: "Admin must approve your delivery account before jobs can be assigned.",
      link: "dashboard.html",
      actionText: "Check Status"
    })}
  `;
}


const DASHBOARD_ICONS = {
  "Marketplace": "🛍️",
  "Wishlist": "♡",
  "Shopping Cart": "🛒",
  "My Orders": "📦",
  "Merchant Dashboard": "🏪",
  "Merchant Orders": "📋",
  "Merchant Earnings": "₨",
  "Merchant Analytics": "📊",
  "Delivery Dashboard": "🚚",
  "Assigned Deliveries": "📍",
  "Admin Panel": "⚙️",
  "Users": "👥",
  "Products": "🧺",
  "Payments": "💳",
  "Delivery": "🚚",
  "Commission Dashboard": "₨",
  "Payouts": "🏦",
  "Reviews": "⭐",
  "Categories": "🗂️",
  "Ad Banners": "📢",
  "Slot Requests": "🧾",
  "Admin Analytics": "📊",
  "Waiting for Approval": "⏳",
  "Account Blocked": "⛔",
  "Error": "⚠️",
  "Cart Items": "🛒",
  "Wishlist Items": "♡",
  "Active Orders": "📦",
  "Delivered Orders": "✅",
  "Product Slots": "🧺",
  "Active Listings": "🟢",
  "Merchant Orders": "📋",
  "Assigned Jobs": "🚚",
  "Active Jobs": "📍",
  "Picked Up": "📦",
  "Out For Delivery": "🚚",
  "Submitted": "🧾",
  "Users": "👥",
  "Orders": "📦",
  "Pending Merchants": "⏳"
};

/* ==========================================================
   COMPONENTS
========================================================== */

function statCard(value, label, note = "") {
  const icon = getDashboardIcon(label);

  return `
    <div class="dash-stat real-stat-card premium-stat-card">
      <div class="dashboard-card-icon stat-card-icon">${icon}</div>

      <span>${escapeHtml(label)}</span>

      <strong>${escapeHtml(value)}</strong>

      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function dashboardCard({
  label,
  title,
  description,
  link,
  actionText = "Open"
}) {
  const icon = getDashboardIcon(title);

  return `
    <a class="dashboard-card real-action-card premium-dashboard-card" href="${escapeHtml(link)}">
      <div class="dashboard-card-top">
        <span class="action-label">${escapeHtml(label)}</span>
        <div class="dashboard-card-icon">${icon}</div>
      </div>

      <h3>${escapeHtml(title)}</h3>

      <p>${escapeHtml(description)}</p>

      <strong class="action-link">
        ${escapeHtml(actionText)} →
      </strong>
    </a>
  `;
}

function skeletonCard() {
  return `
    <div class="dashboard-card real-action-card premium-dashboard-card dashboard-skeleton">
      <div class="dashboard-card-top">
        <span class="action-label">Loading</span>
        <div class="dashboard-card-icon">…</div>
      </div>

      <h3>Loading...</h3>

      <p>Please wait while the dashboard is prepared.</p>

      <strong class="action-link">Loading</strong>
    </div>
  `;
}

/* ==========================================================
   HELPERS
========================================================== */


function getFriendlyDashboardError(error, fallbackMessage) {
  const code = String(error?.code || "");

  const messages = {
    "permission-denied":
      "You do not have permission to access this dashboard.",
    "unavailable":
      "MauMarket is temporarily unavailable. Please try again.",
    "failed-precondition":
      "The dashboard could not be prepared. Please refresh and try again.",
    "resource-exhausted":
      "The service is temporarily busy. Please try again.",
    "auth/network-request-failed":
      "Please check your internet connection and try again."
  };

  return messages[code] || fallbackMessage;
}

function getDashboardIcon(title) {
  return DASHBOARD_ICONS[title] || "◇";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
