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
      renderError("Profile missing", "Your MauMarket profile was not found.");
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

    await renderBuyerDashboard(user.uid);
  } catch (error) {
    renderError("Dashboard error", error.message);
  }
});

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

  actions.innerHTML = "";
}

function renderError(title, message) {
  roleBadge.textContent = "Error";
  welcome.textContent = title;
  statusText.textContent = message;
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard("Error", title, message, "dashboard.html", "Retry")}
  `;
}

function renderBlocked() {
  roleBadge.textContent = "Blocked";
  welcome.textContent = "Account blocked";
  statusText.textContent = "Your account has been blocked. Please contact MauMarket support.";
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard("Blocked", "Account Blocked", "You cannot use MauMarket while your account is blocked.", "login.html", "Exit")}
  `;
}

async function renderBuyerDashboard(uid) {
  roleBadge.textContent = "Buyer Account";
  statusText.textContent = "Shop products, save favourites, checkout securely and track every order.";

  let cartCount = 0;
  let wishlistCount = 0;
  let activeOrders = 0;
  let deliveredOrders = 0;

  try {
    const cartSnap = await getDocs(collection(db, "carts", uid, "items"));
    cartCount = cartSnap.size;
  } catch {}

  try {
    const wishlistSnap = await getDocs(collection(db, "wishlists", uid, "items"));
    wishlistCount = wishlistSnap.size;
  } catch {}

  try {
    const ordersQ = query(collection(db, "orders"), where("customerId", "==", uid));
    const ordersSnap = await getDocs(ordersQ);

    ordersSnap.forEach((docSnap) => {
      const status = docSnap.data().orderStatus || "";

      if (status === "Delivered") deliveredOrders++;

      if (status !== "Delivered" && status !== "Cancelled") {
        activeOrders++;
      }
    });
  } catch {}

  actions.innerHTML = `
    ${dashboardCard("Shop", "Marketplace", "Browse products and services from local sellers.", "products.html", "Shop Now")}
    ${dashboardCard("Wishlist", "Wishlist", "View the products and services you saved for later.", "wishlist.html", "View Wishlist")}
    ${dashboardCard("Cart", "Shopping Cart", "Review your selected items before checkout.", "cart.html", "View Cart")}
    ${dashboardCard("Orders", "My Orders", "Track your payment, delivery and order progress.", "my-orders.html", "View Orders")}
  `;

  quickStats.innerHTML = `
    ${statCard(cartCount, "Cart Items", "Items waiting for checkout")}
    ${statCard(wishlistCount, "Wishlist Items", "Saved products")}
    ${statCard(activeOrders, "Active Orders", "Orders still in progress")}
    ${statCard(deliveredOrders, "Delivered Orders", "Completed orders")}
  `;
}

async function renderSellerDashboard(uid, data) {
  roleBadge.textContent = "Seller Account";
  statusText.textContent = "Manage your shop, listings, customer orders, earnings and analytics.";

  let productCount = 0;
  let activeProducts = 0;
  let sellerOrders = 0;
  let deliveredOrders = 0;

  const productLimit = Number(data.productLimit || 50);

  try {
    const productsQ = query(collection(db, "products"), where("sellerId", "==", uid));
    const productsSnap = await getDocs(productsQ);

    productCount = productsSnap.size;

    productsSnap.forEach((docSnap) => {
      if (docSnap.data().active === true) {
        activeProducts++;
      }
    });
  } catch {}

  try {
    const ordersQ = query(collection(db, "orders"), where("sellerIds", "array-contains", uid));
    const ordersSnap = await getDocs(ordersQ);

    sellerOrders = ordersSnap.size;

    ordersSnap.forEach((docSnap) => {
      if (docSnap.data().orderStatus === "Delivered") {
        deliveredOrders++;
      }
    });
  } catch {}

  actions.innerHTML = `
    ${dashboardCard("Shop", "Seller Dashboard", "Manage your shop profile, products and services.", "seller.html", "Open Shop")}
    ${dashboardCard("Orders", "Seller Orders", "View and prepare customer orders.", "seller-orders.html", "Manage Orders")}
    ${dashboardCard("Earnings", "Seller Earnings", "Track sales, payouts and income.", "seller-earnings.html", "View Earnings")}
    ${dashboardCard("Analytics", "Seller Analytics", "View performance, product stats and shop insights.", "seller-analytics.html", "View Analytics")}
    ${dashboardCard("Market", "Marketplace", "View your shop as customers see it.", "products.html", "View Marketplace")}
  `;

  quickStats.innerHTML = `
    ${statCard(`${productCount}/${productLimit}`, "Product Slots", "Used listing capacity")}
    ${statCard(activeProducts, "Active Listings", "Visible products and services")}
    ${statCard(sellerOrders, "Shop Orders", "Orders linked to your shop")}
    ${statCard(deliveredOrders, "Delivered Orders", "Completed customer orders")}
  `;
}

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
    const jobsQ = query(collection(db, "deliveryJobs"), where("driverId", "==", uid));
    const jobsSnap = await getDocs(jobsQ);

    assigned = jobsSnap.size;

    jobsSnap.forEach((docSnap) => {
      const job = docSnap.data();
      const status = job.orderStatus || "";

      if (status === "Picked Up") pickedUp++;
      if (status === "Out for Delivery") outForDelivery++;
      if (status === "Delivery Submitted") submitted++;
      if (status === "Delivered") delivered++;

      if (status !== "Delivered" && status !== "Cancelled" && job.active !== false) {
        active++;
      }
    });
  } catch {}

  actions.innerHTML = `
    ${dashboardCard("Delivery", "Delivery Dashboard", "View assigned deliveries and update order progress.", "delivery.html", "Open Deliveries")}
    ${dashboardCard("Active", "Assigned Deliveries", "See pickups, pinned locations and signatures.", "delivery.html", "View Assigned")}
    ${dashboardCard("Market", "Marketplace", "Browse MauMarket products and services.", "products.html", "View Marketplace")}
  `;

  quickStats.innerHTML = `
    ${statCard(assigned, "Assigned Jobs", "All jobs assigned to you")}
    ${statCard(active, "Active Jobs", "Still in progress")}
    ${statCard(pickedUp, "Picked Up", "Collected from seller")}
    ${statCard(outForDelivery, "Out For Delivery", "Currently delivering")}
    ${statCard(submitted, "Submitted", "Waiting admin validation")}
    ${statCard(delivered, "Delivered", "Completed deliveries")}
  `;
}

async function renderAdminDashboard() {
  roleBadge.textContent = "Admin Account";
  statusText.textContent = "Manage users, products, payments, delivery, payouts, analytics and platform operations.";

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
  } catch {}

  try {
    const productsSnap = await getDocs(collection(db, "products"));
    productsCount = productsSnap.size;
  } catch {}

  try {
    const ordersSnap = await getDocs(collection(db, "orders"));
    ordersCount = ordersSnap.size;
  } catch {}

  actions.innerHTML = `
    ${dashboardCard("Admin", "Admin Panel", "Open the main MauMarket control center.", "admin.html", "Open Admin")}
    ${dashboardCard("Users", "Users", "Manage buyers, sellers, delivery users and admins.", "admin-users.html", "Manage Users")}
    ${dashboardCard("Products", "Products", "Review, hide, approve or remove products.", "admin-products.html", "Manage Products")}
    ${dashboardCard("Payments", "Payments", "Verify Juice payment screenshots and payment history.", "admin-payments.html", "Verify Payments")}
    ${dashboardCard("Delivery", "Delivery", "Assign drivers and manage delivery flow.", "admin-delivery.html", "Manage Delivery")}
    ${dashboardCard("Commission", "Commission Dashboard", "Track MauMarket revenue and seller payouts.", "admin-commission.html", "View Commission")}
    ${dashboardCard("Payouts", "Payouts", "Manage seller payout status.", "admin-payouts.html", "Manage Payouts")}
    ${dashboardCard("Reviews", "Reviews", "Moderate customer reviews and ratings.", "admin-reviews.html", "Manage Reviews")}
    ${dashboardCard("Categories", "Categories", "Manage marketplace categories.", "admin-categories.html", "Manage Categories")}
    ${dashboardCard("Banners", "Ad Banners", "Manage featured shop banners.", "admin-banners.html", "Manage Banners")}
    ${dashboardCard("Quota", "Slot Requests", "Approve seller product slot requests.", "admin-quota.html", "Review Requests")}
    ${dashboardCard("Analytics", "Admin Analytics", "View platform performance and reports.", "admin-analytics.html", "View Analytics")}
  `;

  quickStats.innerHTML = `
    ${statCard(usersCount, "Users", "Registered platform accounts")}
    ${statCard(productsCount, "Products", "Products and services listed")}
    ${statCard(ordersCount, "Orders", "Orders placed on MauMarket")}
    ${statCard(pendingSellers, "Pending Sellers", "Seller approvals waiting")}
  `;
}

function renderPendingSeller() {
  roleBadge.textContent = "Seller Pending";
  welcome.textContent = "Seller account pending";
  statusText.textContent = "Your seller account is waiting for admin approval.";
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard("Pending", "Waiting for Approval", "Admin must approve your seller account first.", "dashboard.html", "Check Status")}
    ${dashboardCard("Market", "Marketplace", "Browse products while waiting.", "products.html", "Shop Now")}
  `;
}

function renderPendingDelivery() {
  roleBadge.textContent = "Delivery Pending";
  welcome.textContent = "Delivery account pending";
  statusText.textContent = "Your delivery account is waiting for admin approval.";
  quickStats.innerHTML = "";

  actions.innerHTML = `
    ${dashboardCard("Pending", "Waiting for Approval", "Admin must approve your delivery account first.", "dashboard.html", "Check Status")}
  `;
}

function statCard(value, label, note = "") {
  return `
    <div class="dash-stat real-stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function dashboardCard(label, title, description, link, actionText = "Open") {
  return `
    <a class="dashboard-card real-action-card" href="${escapeHtml(link)}">
      <div class="action-card-top">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(actionText)}</strong>
      </div>

      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>

      <div class="action-card-footer">
        <span>${escapeHtml(actionText)}</span>
        <b>→</b>
      </div>
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
