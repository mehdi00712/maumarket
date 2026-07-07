import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  MauMarket nav.js
  Premium shared navigation
  - Animated hamburger
  - Role-based menu
  - Instant marketplace search when already on products.html
  - Redirect search when on another page
  - Sticky desktop search
  - Mobile bottom navigation
*/

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
  removeOldHeaders();

  const header = document.createElement("header");
  header.className = "mm-nav premium-mm-nav";

  header.innerHTML = `
    <div class="mm-nav-inner">
      <button id="mmMenuBtn" class="mm-icon-btn premium-menu-btn" type="button" aria-label="Open menu" aria-expanded="false">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <a href="index.html" class="mm-logo">
        <img src="${LOGO_PATH}" alt="MauMarket">
      </a>

      <form id="mmSearchForm" class="mm-search premium-search">
        <select id="mmSearchCategory" aria-label="Category">
          <option value="">All Categories</option>
          <option value="Beauty">Beauty</option>
          <option value="Electronics">Electronics</option>
          <option value="Fashion">Fashion</option>
          <option value="Food">Food</option>
          <option value="Hardware">Hardware</option>
          <option value="Home">Home</option>
          <option value="Services">Services</option>
          <option value="Other">Other</option>
        </select>

        <input id="mmSearchInput" type="search" placeholder="Search products, services, shops..." autocomplete="off">

        <button type="submit" aria-label="Search">Search</button>
      </form>

      <nav id="mmDesktopLinks" class="mm-desktop-links"></nav>

      <a href="cart.html" class="mm-cart-btn" aria-label="Cart">
        <span id="mmCartBadge" class="mm-cart-badge">0</span>
        <svg class="cart-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M3 5H5L7.2 15.2C7.32 15.72 7.78 16.1 8.32 16.1H18.2C18.72 16.1 19.18 15.75 19.32 15.25L21 8H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="9" cy="20" r="1.6" fill="currentColor"/>
          <circle cx="18" cy="20" r="1.6" fill="currentColor"/>
        </svg>
      </a>
    </div>
  `;

  document.body.prepend(header);

  const mobileSearch = document.createElement("section");
  mobileSearch.id = "mmMobileSearch";
  mobileSearch.className = "mm-mobile-search-wrap";
  mobileSearch.innerHTML = `
    <form id="mmMobileSearchForm" class="mm-mobile-search">
      <input id="mmMobileSearchInput" type="search" placeholder="Search MauMarket..." autocomplete="off">
      <button type="submit" aria-label="Search">⌕</button>
    </form>
  `;

  header.insertAdjacentElement("afterend", mobileSearch);

  const overlay = document.createElement("div");
  overlay.id = "mmMenuOverlay";
  overlay.className = "mm-menu-overlay";

  const sideMenu = document.createElement("aside");
  sideMenu.id = "mmSideMenu";
  sideMenu.className = "mm-side-menu premium-side-menu";

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

  const bottomNav = document.createElement("nav");
  bottomNav.id = "mmBottomNav";
  bottomNav.className = "mm-bottom-nav";

  document.body.appendChild(overlay);
  document.body.appendChild(sideMenu);
  document.body.appendChild(bottomNav);

  document.getElementById("mmMenuBtn")?.addEventListener("click", toggleMenu);
  document.getElementById("mmMenuClose")?.addEventListener("click", closeMenu);
  overlay.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.getElementById("mmSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runNavSearch(true);
  });

  document.getElementById("mmSearchInput")?.addEventListener("input", () => {
    if (isProductsPage()) {
      runNavSearch(false);
    }
  });

  document.getElementById("mmSearchCategory")?.addEventListener("change", () => {
    if (isProductsPage()) {
      runNavSearch(true);
    }
  });

  document.getElementById("mmMobileSearchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runMobileNavSearch(true);
  });

  document.getElementById("mmMobileSearchInput")?.addEventListener("input", () => {
    if (isProductsPage()) {
      runMobileNavSearch(false);
    }
  });
}

function removeOldHeaders() {
  const selectors = [
    ".mobile-market-header",
    ".mobile-search-area",
    ".mobile-side-menu",
    ".mobile-menu-overlay",
    ".market-pro-header",
    ".amazon-topbar",
    ".amazon-subnav",
    ".navbar",
    ".market-mobile-header"
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
  const bottomNav = document.getElementById("mmBottomNav");

  if (!desktopLinks || !mobileLinks || !userBox || !bottomNav) return;

  const links = getLinksForRole();
  const desktop = links.filter((link) => link.desktop !== false);

  desktopLinks.innerHTML = desktop
    .map((link) => renderDesktopLink(link))
    .join("");

  mobileLinks.innerHTML = links
    .map((link) => renderMobileLink(link))
    .join("");

  bottomNav.innerHTML = getBottomLinks()
    .map((link) => renderBottomLink(link))
    .join("");

  userBox.innerHTML = getUserBoxHtml();

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", logoutUser);
  });

  document.querySelectorAll(".mm-mobile-link, .mm-bottom-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (!link.dataset.action) closeMenu();
    });
  });

  markCurrentLinks();
}

function renderDesktopLink(link) {
  if (link.isButton) {
    return `
      <button class="mm-link-button" data-action="${escapeHtml(link.action)}" type="button">
        ${escapeHtml(link.label)}
      </button>
    `;
  }

  return `
    <a href="${escapeHtml(link.href)}">
      ${escapeHtml(link.label)}
    </a>
  `;
}

function renderMobileLink(link) {
  if (link.isButton) {
    return `
      <button class="mm-mobile-link" data-action="${escapeHtml(link.action)}" type="button">
        <span>${link.icon || ""}</span>
        <strong>${escapeHtml(link.label)}</strong>
      </button>
    `;
  }

  return `
    <a class="mm-mobile-link" href="${escapeHtml(link.href)}">
      <span>${link.icon || ""}</span>
      <strong>${escapeHtml(link.label)}</strong>
    </a>
  `;
}

function renderBottomLink(link) {
  return `
    <a class="mm-bottom-link" href="${escapeHtml(link.href)}">
      <span>${link.icon}</span>
      <small>${escapeHtml(link.label)}</small>
    </a>
  `;
}

function getLinksForRole() {
  if (!currentUser) {
    return [
      { label: "Marketplace", icon: "⌂", href: "products.html" },
      { label: "Login", icon: "↗", href: "login.html" },
      { label: "Join Now", icon: "+", href: "register.html" }
    ];
  }

  if (currentRole === "admin") {
    return [
      { label: "Admin", icon: "⚙", href: "dashboard.html" },
      { label: "Users", icon: "👥", href: "admin-users.html" },
      { label: "Products", icon: "□", href: "admin-products.html" },
      { label: "Payments", icon: "▣", href: "admin-payments.html" },
      { label: "Delivery", icon: "▸", href: "admin-delivery.html" },
      { label: "Analytics", icon: "⌁", href: "admin-analytics.html" },
      { label: "Marketplace", icon: "⌂", href: "products.html", desktop: false },
      { label: "Logout", icon: "×", isButton: true, action: "logout" }
    ];
  }

  if (currentRole === "seller") {
    return [
      { label: "Marketplace", icon: "⌂", href: "products.html" },
      { label: "Seller", icon: "▣", href: "seller.html" },
      { label: "Orders", icon: "□", href: "seller-orders.html" },
      { label: "Earnings", icon: "₨", href: "seller-earnings.html" },
      { label: "Analytics", icon: "⌁", href: "seller-analytics.html" },
      { label: "Dashboard", icon: "○", href: "dashboard.html" },
      { label: "Logout", icon: "×", isButton: true, action: "logout" }
    ];
  }

  return [
    { label: "Marketplace", icon: "⌂", href: "products.html" },
    { label: "Wishlist", icon: "♡", href: "wishlist.html" },
    { label: "Orders", icon: "□", href: "my-orders.html" },
    { label: "My Account", icon: "○", href: "dashboard.html" },
    { label: "Cart", icon: "▣", href: "cart.html" },
    { label: "Logout", icon: "×", isButton: true, action: "logout", desktop: false }
  ];
}

function getBottomLinks() {
  if (currentRole === "admin") {
    return [
      { label: "Home", icon: "⌂", href: "index.html" },
      { label: "Admin", icon: "⚙", href: "admin.html" },
      { label: "Products", icon: "□", href: "admin-products.html" },
      { label: "Payments", icon: "▣", href: "admin-payments.html" },
      { label: "My Account", icon: "○", href: "dashboard.html" }
    ];
  }

  if (currentRole === "seller") {
    return [
      { label: "Home", icon: "⌂", href: "index.html" },
      { label: "Shop", icon: "▣", href: "seller.html" },
      { label: "Orders", icon: "□", href: "seller-orders.html" },
      { label: "Market", icon: "◇", href: "products.html" },
      { label: "My Account", icon: "○", href: "dashboard.html" }
    ];
  }

  return [
    { label: "Home", icon: "⌂", href: "index.html" },
    { label: "Market", icon: "◇", href: "products.html" },
    { label: "Wishlist", icon: "♡", href: "wishlist.html" },
    { label: "Cart", icon: "▣", href: "cart.html" },
    { label: "My Account", icon: "○", href: currentUser ? "dashboard.html" : "login.html" }
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

function toggleMenu() {
  const sideMenu = document.getElementById("mmSideMenu");

  if (sideMenu?.classList.contains("show")) {
    closeMenu();
  } else {
    openMenu();
  }
}

function openMenu() {
  document.getElementById("mmSideMenu")?.classList.add("show");
  document.getElementById("mmMenuOverlay")?.classList.add("show");

  const btn = document.getElementById("mmMenuBtn");
  btn?.classList.add("active");
  btn?.setAttribute("aria-expanded", "true");

  document.body.classList.add("menu-open");
}

function closeMenu() {
  document.getElementById("mmSideMenu")?.classList.remove("show");
  document.getElementById("mmMenuOverlay")?.classList.remove("show");

  const btn = document.getElementById("mmMenuBtn");
  btn?.classList.remove("active");
  btn?.setAttribute("aria-expanded", "false");

  document.body.classList.remove("menu-open");
}


function runMobileNavSearch(scrollToResults) {
  const mobileInput = document.getElementById("mmMobileSearchInput");
  const desktopInput = document.getElementById("mmSearchInput");
  const category = document.getElementById("mmSearchCategory");

  const search = mobileInput?.value.trim() || "";
  const selectedCategory = category?.value || "";

  if (desktopInput && desktopInput.value !== search) {
    desktopInput.value = search;
  }

  if (isProductsPage()) {
    window.dispatchEvent(new CustomEvent("maumarket:search", {
      detail: {
        search,
        category: selectedCategory,
        scroll: scrollToResults
      }
    }));

    updateProductsUrl(search, selectedCategory);
    return;
  }

  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (selectedCategory) params.set("category", selectedCategory);

  window.location.href = params.toString()
    ? `products.html?${params.toString()}`
    : "products.html";
}


function runNavSearch(scrollToResults) {
  const input = document.getElementById("mmSearchInput");
  const category = document.getElementById("mmSearchCategory");

  const search = input?.value.trim() || "";
  const selectedCategory = category?.value || "";

  const mobileInput = document.getElementById("mmMobileSearchInput");
  if (mobileInput && mobileInput.value !== search) {
    mobileInput.value = search;
  }

  if (isProductsPage()) {
    window.dispatchEvent(new CustomEvent("maumarket:search", {
      detail: {
        search,
        category: selectedCategory,
        scroll: scrollToResults
      }
    }));

    updateProductsUrl(search, selectedCategory);
    return;
  }

  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (selectedCategory) params.set("category", selectedCategory);

  window.location.href = params.toString()
    ? `products.html?${params.toString()}`
    : "products.html";
}

function isProductsPage() {
  const path = window.location.pathname.toLowerCase();

  return path.endsWith("/products.html") ||
    path.endsWith("products.html") ||
    path.endsWith("/products") ||
    path === "/" && document.getElementById("productsGrid");
}

function updateProductsUrl(search, category) {
  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (category) params.set("category", category);

  const nextUrl = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;

  window.history.replaceState({}, "", nextUrl);
}

async function logoutUser() {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    alert(error.message);
  }
}

function markCurrentLinks() {
  const current = window.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".mm-desktop-links a, .mm-mobile-link, .mm-bottom-link").forEach((link) => {
    const href = link.getAttribute("href");

    if (!href) return;

    const file = href.split("?")[0];

    if (file === current) {
      link.classList.add("active");
    }
  });
}



function updateCartBadge() {
  const badge = document.getElementById("mmCartBadge");
  if (!badge) return;
  let cart=[];
  try{cart=JSON.parse(localStorage.getItem("cart")||"[]");}catch(e){}
  const count=cart.reduce((t,i)=>t+Number(i.quantity||1),0);
  badge.textContent=count;
  badge.style.display=count? "flex":"none";
  if(count){
    badge.classList.remove("cart-bounce");
    void badge.offsetWidth;
    badge.classList.add("cart-bounce");
  }
}
window.addEventListener("storage",updateCartBadge);
window.addEventListener("cart-updated",updateCartBadge);
document.addEventListener("DOMContentLoaded",()=>setTimeout(updateCartBadge,100));

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
