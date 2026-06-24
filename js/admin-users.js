import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const usersList = document.getElementById("usersList");

const totalUsersCount = document.getElementById("totalUsersCount");
const customersCount = document.getElementById("customersCount");
const sellersCount = document.getElementById("sellersCount");
const deliveryCount = document.getElementById("deliveryCount");
const pendingCount = document.getElementById("pendingCount");
const blockedCount = document.getElementById("blockedCount");

const userSearchInput = document.getElementById("userSearchInput");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const usersResultCount = document.getElementById("usersResultCount");

let currentUser = null;
let allUsers = [];

userSearchInput?.addEventListener("input", renderUsers);
roleFilter?.addEventListener("change", renderUsers);
statusFilter?.addEventListener("change", renderUsers);

clearFiltersBtn?.addEventListener("click", () => {
  if (userSearchInput) userSearchInput.value = "";
  if (roleFilter) roleFilter.value = "";
  if (statusFilter) statusFilter.value = "";
  renderUsers();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

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

    await loadUsers();
  } catch (error) {
    usersList.innerHTML = `
      <div class="order-card">
        <h3>Could not load users</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
});

async function loadUsers() {
  usersList.innerHTML = `
    <div class="order-card">
      Loading users...
    </div>
  `;

  try {
    let snapshot;

    try {
      const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
      snapshot = await getDocs(q);
    } catch (error) {
      snapshot = await getDocs(collection(db, "users"));
    }

    allUsers = [];

    snapshot.forEach((docSnap) => {
      allUsers.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    allUsers.sort((a, b) => {
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    updateStats();
    renderUsers();
  } catch (error) {
    usersList.innerHTML = `
      <div class="order-card">
        <h3>Could not load users</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function updateStats() {
  let customers = 0;
  let sellers = 0;
  let delivery = 0;
  let pending = 0;
  let blocked = 0;

  allUsers.forEach((user) => {
    if (user.role === "customer") customers++;
    if (user.role === "seller") sellers++;
    if (user.role === "delivery") delivery++;

    if (
      (user.role === "seller" || user.role === "delivery") &&
      user.approved !== true
    ) {
      pending++;
    }

    if (user.blocked === true) blocked++;
  });

  if (totalUsersCount) totalUsersCount.textContent = allUsers.length;
  if (customersCount) customersCount.textContent = customers;
  if (sellersCount) sellersCount.textContent = sellers;
  if (deliveryCount) deliveryCount.textContent = delivery;
  if (pendingCount) pendingCount.textContent = pending;
  if (blockedCount) blockedCount.textContent = blocked;
}

function renderUsers() {
  const search = (userSearchInput?.value || "").toLowerCase().trim();
  const role = roleFilter?.value || "";
  const status = statusFilter?.value || "";

  let filtered = allUsers.filter((user) => {
    const searchable = `
      ${user.name || ""}
      ${user.email || ""}
      ${user.phone || ""}
      ${user.role || ""}
      ${user.id || ""}
    `.toLowerCase();

    const matchesSearch = !search || searchable.includes(search);
    const matchesRole = !role || user.role === role;

    let matchesStatus = true;

    if (status === "approved") {
      matchesStatus = user.approved === true && user.blocked !== true;
    }

    if (status === "pending") {
      matchesStatus =
        (user.role === "seller" || user.role === "delivery") &&
        user.approved !== true &&
        user.blocked !== true;
    }

    if (status === "blocked") {
      matchesStatus = user.blocked === true;
    }

    return matchesSearch && matchesRole && matchesStatus;
  });

  if (usersResultCount) {
    usersResultCount.textContent = `${filtered.length} user(s)`;
  }

  if (filtered.length === 0) {
    usersList.innerHTML = `
      <div class="order-card">
        <h3>No users found</h3>
        <p>Try another search or filter.</p>
      </div>
    `;
    return;
  }

  usersList.innerHTML = "";

  filtered.forEach((user) => {
    usersList.appendChild(createUserCard(user));
  });
}

function createUserCard(user) {
  const userId = user.id;
  const isCurrentAdmin = currentUser.uid === userId;
  const isPendingSeller = user.role === "seller" && user.approved !== true;
  const isPendingDelivery = user.role === "delivery" && user.approved !== true;

  const div = document.createElement("div");
  div.className = "order-card";

  div.innerHTML = `
    <div class="section-row-title">
      <div>
        <h3>${escapeHtml(user.name || "No Name")}</h3>
        <p class="muted">${escapeHtml(user.email || "No email")}</p>
      </div>

      <span class="${user.blocked ? "status-danger" : "status-pill"}">
        ${user.blocked ? "Blocked" : getUserStatus(user)}
      </span>
    </div>

    <div class="order-grid">
      <div>
        <p><strong>Phone:</strong> ${escapeHtml(user.phone || "Not provided")}</p>
        <p><strong>Role:</strong> ${escapeHtml(user.role || "customer")}</p>
        <p><strong>User ID:</strong> ${escapeHtml(userId)}</p>
      </div>

      <div>
        <p><strong>Approved:</strong> ${user.approved === true ? "Yes" : "No"}</p>
        <p><strong>Blocked:</strong> ${user.blocked === true ? "Yes" : "No"}</p>
        <p><strong>Product Limit:</strong> ${Number(user.productLimit || 50)}</p>
      </div>
    </div>

    <div class="seller-actions">
      ${
        isPendingSeller
          ? `<button class="approve-seller-btn">Approve Seller</button>`
          : ""
      }

      ${
        isPendingDelivery
          ? `<button class="approve-delivery-btn">Approve Delivery</button>`
          : ""
      }

      ${
        user.role === "seller"
          ? `<button class="limit-btn">Set Product Limit</button>`
          : ""
      }

      <button class="toggle-block-btn">
        ${user.blocked ? "Unblock" : "Block"}
      </button>

      ${
        !isCurrentAdmin
          ? `<button class="danger-btn delete-user-btn">Delete Profile</button>`
          : `<button disabled>Current Admin</button>`
      }
    </div>
  `;

  div.querySelector(".approve-seller-btn")?.addEventListener("click", async () => {
    await approveUser(userId);
  });

  div.querySelector(".approve-delivery-btn")?.addEventListener("click", async () => {
    await approveUser(userId);
  });

  div.querySelector(".toggle-block-btn")?.addEventListener("click", async () => {
    await toggleBlockUser(user);
  });

  div.querySelector(".limit-btn")?.addEventListener("click", async () => {
    await updateProductLimit(user);
  });

  div.querySelector(".delete-user-btn")?.addEventListener("click", async () => {
    await deleteUserProfile(user);
  });

  return div;
}

async function approveUser(userId) {
  await updateDoc(doc(db, "users", userId), {
    approved: true,
    blocked: false,
    updatedAt: serverTimestamp()
  });

  await loadUsers();
}

async function toggleBlockUser(user) {
  if (currentUser.uid === user.id) {
    alert("You cannot block your own admin account.");
    return;
  }

  const nextBlocked = user.blocked !== true;

  const message = nextBlocked
    ? "Block this user? They will lose access."
    : "Unblock this user?";

  if (!confirm(message)) return;

  await updateDoc(doc(db, "users", user.id), {
    blocked: nextBlocked,
    updatedAt: serverTimestamp()
  });

  await loadUsers();
}

async function updateProductLimit(user) {
  const currentLimit = Number(user.productLimit || 50);
  const value = prompt("Enter new product limit:", String(currentLimit));

  if (value === null) return;

  const limit = Number(value);

  if (!Number.isFinite(limit) || limit < 1) {
    alert("Please enter a valid product limit.");
    return;
  }

  await updateDoc(doc(db, "users", user.id), {
    productLimit: limit,
    updatedAt: serverTimestamp()
  });

  await loadUsers();
}

async function deleteUserProfile(user) {
  if (currentUser.uid === user.id) {
    alert("You cannot delete your own admin profile.");
    return;
  }

  const confirmed = confirm(
    "Delete this Firestore user profile? This does not delete the Firebase Auth login."
  );

  if (!confirmed) return;

  await deleteDoc(doc(db, "users", user.id));
  await loadUsers();
}

function getUserStatus(user) {
  if (user.blocked === true) return "Blocked";

  if (
    (user.role === "seller" || user.role === "delivery") &&
    user.approved !== true
  ) {
    return "Pending";
  }

  if (user.approved === true || user.role === "customer" || user.role === "admin") {
    return "Active";
  }

  return "Active";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
