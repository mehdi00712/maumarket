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

const categoryForm = document.getElementById("categoryForm");
const categoryName = document.getElementById("categoryName");
const categoryDescription = document.getElementById("categoryDescription");
const categoryCountText = document.getElementById("categoryCountText");
const categoriesList = document.getElementById("categoriesList");

let categories = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const adminSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !adminSnap.exists() ||
    adminSnap.data().role !== "admin" ||
    adminSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadCategories();
});

categoryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = categoryName.value.trim();
  const description = categoryDescription.value.trim();

  if (!name) {
    alert("Category name is required.");
    return;
  }

  await addDoc(collection(db, "categories"), {
    name,
    description,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  categoryForm.reset();
  await loadCategories();
});

async function loadCategories() {
  categoriesList.innerHTML = "Loading categories...";

  const snapshot = await getDocs(collection(db, "categories"));

  categories = [];

  snapshot.forEach((docSnap) => {
    categories.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  categories.sort((a, b) => {
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  renderStats();
  renderCategories();
}

function renderStats() {
  const active = categories.filter((cat) => cat.active !== false).length;
  const hidden = categories.filter((cat) => cat.active === false).length;

  totalCategories.textContent = categories.length;
  activeCategories.textContent = active;
  hiddenCategories.textContent = hidden;

  categoryCountText.textContent = `${categories.length} categorie(s)`;
}

function renderCategories() {
  if (categories.length === 0) {
    categoriesList.innerHTML = `
      <div class="order-card">
        <h3>No categories yet</h3>
        <p>Create your first marketplace category above.</p>
      </div>
    `;
    return;
  }

  categoriesList.innerHTML = "";

  categories.forEach((category) => {
    const isActive = category.active !== false;

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <div class="section-row-title">
        <div>
          <h3>${escapeHtml(category.name || "Unnamed")}</h3>
          <p class="muted">${escapeHtml(category.description || "No description")}</p>
        </div>

        <span class="${isActive ? "status-pill" : "status-danger"}">
          ${isActive ? "Active" : "Hidden"}
        </span>
      </div>

      <div class="seller-actions">
        <button class="edit-btn">Edit</button>
        <button class="toggle-btn">${isActive ? "Hide" : "Show"}</button>
        <button class="danger-btn">Delete</button>
      </div>
    `;

    div.querySelector(".edit-btn").addEventListener("click", async () => {
      const newName = prompt("Category name:", category.name || "");
      if (newName === null) return;

      const newDescription = prompt("Category description:", category.description || "");
      if (newDescription === null) return;

      await updateDoc(doc(db, "categories", category.id), {
        name: newName.trim(),
        description: newDescription.trim(),
        updatedAt: serverTimestamp()
      });

      await loadCategories();
    });

    div.querySelector(".toggle-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "categories", category.id), {
        active: !isActive,
        updatedAt: serverTimestamp()
      });

      await loadCategories();
    });

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      if (!confirm("Delete this category permanently?")) return;

      await deleteDoc(doc(db, "categories", category.id));
      await loadCategories();
    });

    categoriesList.appendChild(div);
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
