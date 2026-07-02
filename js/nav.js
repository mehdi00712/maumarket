import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const LOGO_PATH = "images/maumarketlogo.png";

let currentUser = null;
let currentRole = "guest";
let userData = null;

document.addEventListener("DOMContentLoaded", () => {
  buildResponsiveNav();

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    currentRole = "guest";
    userData = null;

    if (user) {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));

        if (userSnap.exists()) {
          userData = userSnap.data();
          currentRole = userData.role || "customer";
        } else {
          currentRole = "customer";
        }
      } catch (error) {
        console.warn("Could not load nav user:", error.message);
        currentRole = "customer";
      }
    }

    renderNavLinks();
  });
});

function buildResponsiveNav() {
  removeOldMobileNav();

  const header = document.createElement("header");
  header.className = "mm-nav";
  header.innerHTML = `
    <div class="mm-nav-inner">
      <button id="mmMenuBtn" class="mm-icon-btn" type="button" aria-label="Open menu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <a href="index.html" class="mm-logo">
        <img src="${LOGO_PATH}" alt="MauMarket">
      </a>

      <form id="mmSearchForm" class="mm-search">
        <select id="mmSearchCategory" aria-label="Category">
          <option value="">All</option>
          <option value="Beauty">Beauty</option>
          <option value="Electronics">Electronics</option>
          <option value="Fashion">Fashion</option>
          <option value="Food">Food</option>
          <option value="Hardware">Hardware</option>
          <option value="Home">Home</option>
          <option value="Services">Services</option>
          <option value="Other">Other</option>
        </select>

        <input id="mmSearchInput" type="search" placeholder="Search MauMarket">

        <button type="submit">Search</button>
      </form>

      <nav id="mmDesktopLinks" class="mm-desktop-links"></nav>

      <a href="cart.html" class="mm-cart-btn" aria-label="Cart">
        🛒
      </a>
    </div>
  `;

  document.body.prepend(header);

  const overlay = document.createElement("div");
  overlay.id = "mmMenuOverlay";
  overlay.className = "mm-menu-overlay";

  const sideMenu = document.createElement("aside");
  sideMenu.id = "mmSideMenu";
  sideMenu.className = "mm-side-menu";
  sideMenu.innerHTML = `
    <div class="mm-side-head">
      <img src="${LOGO_PATH}" alt="MauMarket">
      <button id="mmMenuClose" type="button" aria-label="Close menu">×</button>
    </div>

    <div id="mmUserBox" class="mm-user-box">
      Loading...
    </div>

    <nav id="mmMobileLinks" class="mm-mobile-links"></nav>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(sideMenu);

  document.getElementById("mmMenuBtn")?.addEventListener("click", openMenu);
  document.getElementById("mmMenuClose")?.addEventListener("click", closeMenu);
  overlay.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.getElementById("mmSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const search = document.getElementById("mmSearchInput").value.trim();
    const category = document.getElementById("mmSearchCategory").value;

    const params = new URLSearchParams();

    if (search) params.set("search", search);
    if (category) params.set("category", category);

    window.location.href = params.toString()
      ? `products.html?${params.toString()}`
      : "products.html";
  });
}

function removeOldMobileNav() {
  const selectors = [
    ".mobile-market-header",
    ".mobile-search-area",
    ".mobile-side-menu",
    ".mobile-menu-overlay",
    ".market-pro-header",
    ".amazon-topbar",
    ".amazon-subnav",
    ".navbar"
  ];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.style.display = "none";
    });
  });
}

function renderNavLinks() {
  const desktopLinks = document.getElementById("mmDesktopLinks");
  const mobileLinks = document.getElementById("mmMobileLinks");
  const userBox = document.getElementById("mmUserBox");

  if (!desktopLinks || !mobileLinks || !userBox) return;

  const links = getLinksForRole();

  desktopLinks.innerHTML = links
    .filter((link) => link.desktop !== false)
    .map((link) => link.isButton
      ? `<button class="mm-link-button" data-action="${link.action}" type="button">${link.label}</button>`
      : `<a href="${link.href}">${link.label}</a>`
    )
    .join("");

  mobileLinks.innerHTML = links
    .map((link) => link.isButton
      ? `<button class="mm-mobile-link" data-action="${link.action}" type="button">${link.icon} ${link.label}</button>`
      : `<a class="mm-mobile-link" href="${link.href}">${link.icon} ${link.label}</a>`
    )
    .join("");

  userBox.innerHTML = getUserBoxHtml();

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", logoutUser);
  });

  document.querySelectorAll(".mm-mobile-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (!link.dataset.action) closeMenu();
    });
  });
}

function getLinksForRole() {
  if (!currentUser) {
    return [
      { label: "Marketplace", icon: "🛍", href: "products.html" },
      { label: "Login", icon: "🔐", href: "login.html" },
      { label: "Join Now", icon: "✨", href: "register.html" }
    ];
  }

  if (currentRole === "admin") {
    return [
      { label: "Admin", icon: "🛡", href: "admin.html" },
      { label: "Users", icon: "👥", href: "admin-users.html" },
      { label: "Products", icon: "📦", href: "admin-products.html" },
      { label: "Payments", icon: "💳", href: "admin-payments.html" },
      { label: "Delivery", icon: "🚚", href: "admin-delivery.html" },
      { label: "Reviews", icon: "⭐", href: "admin-reviews.html" },
      { label: "Categories", icon: "🏷", href: "admin-categories.html" },
      { label: "Analytics", icon: "📊", href: "admin-analytics.html" },
      { label: "Logout", icon: "🚪", isButton: true, action: "logout" }
    ];
  }

  if (currentRole === "seller") {
    return [
      { label: "Marketplace", icon: "🛍", href: "products.html" },
      { label: "Seller", icon: "🏪", href: "seller.html" },
      { label: "Orders", icon: "📦", href: "seller-orders.html" },
      { label: "Earnings", icon: "💰", href: "seller-earnings.html" },
      { label: "Analytics", icon: "📊", href: "seller-analytics.html" },
      { label: "Dashboard", icon: "👤", href: "dashboard.html" },
      { label: "Logout", icon: "🚪", isButton: true, action: "logout" }
    ];
  }

  return [
    { label: "Marketplace", icon: "🛍", href: "products.html" },
    { label: "Wishlist", icon: "❤️", href: "wishlist.html" },
    { label: "Cart", icon: "🛒", href: "cart.html" },
    { label: "Orders", icon: "📦", href: "my-orders.html" },
    { label: "Dashboard", icon: "👤", href: "dashboard.html" },
    { label: "Logout", icon: "🚪", isButton: true, action: "logout" }
  ];
}

function getUserBoxHtml() {
  if (!currentUser) {
    return `
      <strong>Welcome to MauMarket</strong>
      <span>Login or create an account to continue.</span>
    `;
  }

  const name =
    userData?.name ||
    userData?.fullName ||
    currentUser.displayName ||
    currentUser.email ||
    "MauMarket User";

  const roleLabel =
    currentRole === "admin"
      ? "Admin Account"
      : currentRole === "seller"
        ? "Seller Account"
        : "Buyer Account";

  return `
    <strong>${escapeHtml(name)}</strong>
    <span>${roleLabel}</span>
  `;
}

async function logoutUser() {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    alert(error.message);
  }
}

function openMenu() {
  document.getElementById("mmSideMenu")?.classList.add("show");
  document.getElementById("mmMenuOverlay")?.classList.add("show");
  document.body.classList.add("menu-open");
}

function closeMenu() {
  document.getElementById("mmSideMenu")?.classList.remove("show");
  document.getElementById("mmMenuOverlay")?.classList.remove("show");
  document.body.classList.remove("menu-open");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
