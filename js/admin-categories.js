import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const totalCategories = document.getElementById("totalCategories");
const activeCategories = document.getElementById("activeCategories");
const hiddenCategories = document.getElementById("hiddenCategories");
const featuredCategories = document.getElementById("featuredCategories");

const categoryForm = document.getElementById("categoryForm");
const categoryName = document.getElementById("categoryName");
const categoryDescription = document.getElementById("categoryDescription");
const categoryIcon = document.getElementById("categoryIcon");
const iconPreview = document.getElementById("iconPreview");
const iconPreviewText = document.getElementById("iconPreviewText");
const categorySortOrder = document.getElementById("categorySortOrder");
const categoryFeatured = document.getElementById("categoryFeatured");

const categorySearchInput = document.getElementById("categorySearchInput");
const categoryStatusFilter = document.getElementById("categoryStatusFilter");
const clearCategoryFiltersBtn = document.getElementById("clearCategoryFiltersBtn");

const categoryCountText = document.getElementById("categoryCountText");
const categoriesList = document.getElementById("categoriesList");

let categories = [];

const ICON_LABELS = {
  grid: "General / All",
  electronics: "Electronics",
  phone: "Phones",
  laptop: "Computers & Laptops",
  fashion: "Fashion",
  beauty: "Beauty",
  food: "Food",
  grocery: "Groceries",
  home: "Home",
  furniture: "Furniture",
  hardware: "Hardware",
  tools: "Tools",
  services: "Services",
  vehicles: "Vehicles",
  baby: "Baby & Kids",
  sports: "Sports",
  books: "Books",
  pets: "Pets",
  health: "Health",
  gift: "Gifts",
  other: "Other"
};

categoryIcon?.addEventListener("change", () => {
  updateIconPreview(categoryIcon.value);
});

categorySearchInput?.addEventListener("input", renderCategories);
categoryStatusFilter?.addEventListener("change", renderCategories);

clearCategoryFiltersBtn?.addEventListener("click", () => {
  if (categorySearchInput) categorySearchInput.value = "";
  if (categoryStatusFilter) categoryStatusFilter.value = "";
  renderCategories();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const adminSnap = await getDoc(doc(db, "users", user.uid));

    if (
      !adminSnap.exists() ||
      adminSnap.data().role !== "admin" ||
      adminSnap.data().blocked === true
    ) {
      window.location.href = "dashboard.html";
      return;
    }

    updateIconPreview(categoryIcon?.value || "grid");
    await loadCategories();
  } catch (error) {
    categoriesList.innerHTML = `
      <div class="order-card">
        <h3>Could not load categories</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
});

categoryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = categoryName.value.trim();
  const description = categoryDescription.value.trim();
  const icon = categoryIcon?.value || "other";
  const sortOrder = Number(categorySortOrder?.value || 0);
  const featured = categoryFeatured?.checked === true;

  if (!name) {
    alert("Category name is required.");
    return;
  }

  await addDoc(collection(db, "categories"), {
    name,
    description,
    icon,
    iconLabel: ICON_LABELS[icon] || "Other",
    sortOrder,
    featured,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  categoryForm.reset();
  if (categorySortOrder) categorySortOrder.value = 0;
  if (categoryIcon) categoryIcon.value = "grid";
  updateIconPreview("grid");

  await loadCategories();
});

async function loadCategories() {
  categoriesList.innerHTML = `
    <div class="order-card">
      Loading categories...
    </div>
  `;

  try {
    const snapshot = await getDocs(collection(db, "categories"));

    categories = [];

    snapshot.forEach((docSnap) => {
      categories.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    categories.sort((a, b) => {
      const aOrder = Number(a.sortOrder || 0);
      const bOrder = Number(b.sortOrder || 0);

      if (aOrder !== bOrder) return aOrder - bOrder;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    renderStats();
    renderCategories();
  } catch (error) {
    categoriesList.innerHTML = `
      <div class="order-card">
        <h3>Could not load categories</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderStats() {
  const active = categories.filter((cat) => cat.active !== false).length;
  const hidden = categories.filter((cat) => cat.active === false).length;
  const featured = categories.filter((cat) => cat.featured === true).length;

  if (totalCategories) totalCategories.textContent = categories.length;
  if (activeCategories) activeCategories.textContent = active;
  if (hiddenCategories) hiddenCategories.textContent = hidden;
  if (featuredCategories) featuredCategories.textContent = featured;
}

function renderCategories() {
  const search = (categorySearchInput?.value || "").toLowerCase().trim();
  const status = categoryStatusFilter?.value || "";

  const filtered = categories.filter((category) => {
    const isActive = category.active !== false;
    const isFeatured = category.featured === true;

    const searchable = `
      ${category.name || ""}
      ${category.description || ""}
      ${category.icon || ""}
      ${category.iconLabel || ""}
    `.toLowerCase();

    const matchesSearch = !search || searchable.includes(search);

    let matchesStatus = true;

    if (status === "active") matchesStatus = isActive;
    if (status === "hidden") matchesStatus = !isActive;
    if (status === "featured") matchesStatus = isFeatured;

    return matchesSearch && matchesStatus;
  });

  if (categoryCountText) {
    categoryCountText.textContent = `${filtered.length} categorie(s)`;
  }

  if (filtered.length === 0) {
    categoriesList.innerHTML = `
      <div class="order-card">
        <h3>No categories found</h3>
        <p>Create a new category or change your filters.</p>
      </div>
    `;
    return;
  }

  categoriesList.innerHTML = "";

  filtered.forEach((category) => {
    categoriesList.appendChild(createCategoryCard(category));
  });
}

function createCategoryCard(category) {
  const isActive = category.active !== false;
  const isFeatured = category.featured === true;
  const icon = normalizeIcon(category.icon);

  const div = document.createElement("div");
  div.className = "order-card";

  div.innerHTML = `
    <div class="section-row-title">
      <div class="category-admin-title">
        <div class="category-admin-icon">
          ${svgIcon(icon)}
        </div>

        <div>
          <h3>${escapeHtml(category.name || "Unnamed")}</h3>
          <p class="muted">${escapeHtml(category.description || "No description")}</p>
        </div>
      </div>

      <span class="${isActive ? "status-pill" : "status-danger"}">
        ${isActive ? "Active" : "Hidden"}
      </span>
    </div>

    <div class="order-grid">
      <div>
        <p><strong>Icon:</strong> ${escapeHtml(ICON_LABELS[icon] || "Other")}</p>
        <p><strong>Sort Order:</strong> ${Number(category.sortOrder || 0)}</p>
        <p><strong>Featured:</strong> ${isFeatured ? "Yes" : "No"}</p>
      </div>

      <div>
        <p><strong>Category ID:</strong> ${escapeHtml(category.id)}</p>
      </div>
    </div>

    <div class="seller-actions">
      <button class="edit-btn">Edit</button>
      <button class="feature-btn">${isFeatured ? "Unfeature" : "Feature"}</button>
      <button class="toggle-btn">${isActive ? "Hide" : "Show"}</button>
      <button class="danger-btn">Delete</button>
    </div>
  `;

  div.querySelector(".edit-btn")?.addEventListener("click", async () => {
    await editCategory(category);
  });

  div.querySelector(".feature-btn")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "categories", category.id), {
      featured: !isFeatured,
      updatedAt: serverTimestamp()
    });

    await loadCategories();
  });

  div.querySelector(".toggle-btn")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "categories", category.id), {
      active: !isActive,
      updatedAt: serverTimestamp()
    });

    await loadCategories();
  });

  div.querySelector(".danger-btn")?.addEventListener("click", async () => {
    if (!confirm("Delete this category permanently?")) return;

    await deleteDoc(doc(db, "categories", category.id));
    await loadCategories();
  });

  return div;
}

async function editCategory(category) {
  const currentIcon = normalizeIcon(category.icon);

  const newName = prompt("Category name:", category.name || "");
  if (newName === null) return;

  const newDescription = prompt("Category description:", category.description || "");
  if (newDescription === null) return;

  const newIcon = prompt(
    `Choose icon key:\n\n${Object.keys(ICON_LABELS).join(", ")}`,
    currentIcon
  );

  if (newIcon === null) return;

  const cleanIcon = normalizeIcon(newIcon);

  const newSortOrder = prompt("Sort order:", String(category.sortOrder || 0));
  if (newSortOrder === null) return;

  await updateDoc(doc(db, "categories", category.id), {
    name: newName.trim(),
    description: newDescription.trim(),
    icon: cleanIcon,
    iconLabel: ICON_LABELS[cleanIcon] || "Other",
    sortOrder: Number(newSortOrder || 0),
    updatedAt: serverTimestamp()
  });

  await loadCategories();
}

function updateIconPreview(icon) {
  const cleanIcon = normalizeIcon(icon);

  if (iconPreview) {
    iconPreview.innerHTML = svgIcon(cleanIcon);
  }

  if (iconPreviewText) {
    iconPreviewText.textContent = ICON_LABELS[cleanIcon] || "Other";
  }
}

function normalizeIcon(icon) {
  const value = String(icon || "other").toLowerCase().trim();

  if (ICON_LABELS[value]) return value;

  if (value.includes("elect")) return "electronics";
  if (value.includes("phone")) return "phone";
  if (value.includes("laptop") || value.includes("computer")) return "laptop";
  if (value.includes("fashion") || value.includes("clothes")) return "fashion";
  if (value.includes("beauty")) return "beauty";
  if (value.includes("food")) return "food";
  if (value.includes("grocery")) return "grocery";
  if (value.includes("home")) return "home";
  if (value.includes("furniture")) return "furniture";
  if (value.includes("hardware")) return "hardware";
  if (value.includes("tool")) return "tools";
  if (value.includes("service")) return "services";
  if (value.includes("vehicle") || value.includes("car")) return "vehicles";
  if (value.includes("baby") || value.includes("kid")) return "baby";
  if (value.includes("sport")) return "sports";
  if (value.includes("book")) return "books";
  if (value.includes("pet")) return "pets";
  if (value.includes("health")) return "health";
  if (value.includes("gift")) return "gift";

  return "other";
}

function svgIcon(type) {
  const icons = {
    grid: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    electronics: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="13" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M8 19h6M11 15v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <rect x="18" y="8" width="3" height="8" rx="1" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    phone: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="8" y="2.5" width="8" height="19" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M11 18h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    laptop: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="4" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M3 19h18l-2-5H5l-2 5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `,
    fashion: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M9 4 6 6l-3 5 4 2 2-3v10h10V10l2 3 4-2-3-5-3-2-3 3h-4L9 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `,
    beauty: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M8 21h8M9 21V9a3 3 0 0 1 6 0v12M7 11h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 5c2-3 4-3 6 0 2-3 4-3 6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    food: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M4 13h16a8 8 0 0 0-16 0Z" stroke="currentColor" stroke-width="2"/>
        <path d="M3 16h18M6 19h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 9h.01M13 7h.01M16 10h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `,
    grocery: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M6 7h15l-2 8H8L6 7ZM6 7 5 3H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="9" cy="20" r="1.5" stroke="currentColor" stroke-width="2"/>
        <circle cx="18" cy="20" r="1.5" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    home: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M3 11 12 4l9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M5 10v10h14V10" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M10 20v-6h4v6" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    furniture: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4" stroke="currentColor" stroke-width="2"/>
        <path d="M4 11h16v8H4v-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M7 19v2M17 19v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    hardware: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="m14 7 3-3 3 3-3 3M4 20l8-8M12 12l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="m5 5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    tools: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M14 6a4 4 0 0 0 5 5L11 19a3 3 0 0 1-4-4l8-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `,
    services: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="7" width="14" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
        <path d="M9 7V5h6v2M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    vehicles: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M5 16h14l-1.5-5h-11L5 16Z" stroke="currentColor" stroke-width="2"/>
        <circle cx="8" cy="18" r="1.5" stroke="currentColor" stroke-width="2"/>
        <circle cx="16" cy="18" r="1.5" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    baby: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7" r="3" stroke="currentColor" stroke-width="2"/>
        <path d="M6 21a6 6 0 0 1 12 0M9 13l-3 3M15 13l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    sports: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
        <path d="M5 9c4 1 9 1 14 0M5 15c4-1 9-1 14 0M12 3c2 5 2 13 0 18" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    books: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3-3V4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M8 8h7M8 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    pets: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="7" cy="8" r="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="17" cy="8" r="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="9" cy="15" r="2" stroke="currentColor" stroke-width="2"/>
        <circle cx="15" cy="15" r="2" stroke="currentColor" stroke-width="2"/>
        <path d="M12 12c2 0 4 3 4 5s-2 3-4 3-4-1-4-3 2-5 4-5Z" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    health: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11Z" stroke="currentColor" stroke-width="2"/>
        <path d="M12 8v6M9 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
    gift: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <path d="M4 10h16v10H4V10Z" stroke="currentColor" stroke-width="2"/>
        <path d="M3 7h18v3H3V7ZM12 7v13" stroke="currentColor" stroke-width="2"/>
        <path d="M12 7C8 7 7 3 9 3s3 4 3 4Zm0 0c4 0 5-4 3-4s-3 4-3 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `,
    other: `
      <svg class="category-svg-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="5" cy="12" r="2" fill="currentColor"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
        <circle cx="19" cy="12" r="2" fill="currentColor"/>
      </svg>
    `
  };

  return icons[type] || icons.other;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
