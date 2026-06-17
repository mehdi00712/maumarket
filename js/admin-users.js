import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const adminSnap = await getDoc(doc(db, "users", user.uid));

  if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  await loadUsers();
});

async function loadUsers() {
  usersList.innerHTML = "Loading users...";

  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    usersList.innerHTML = "<p>No users found.</p>";
    return;
  }

  usersList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const user = docSnap.data();
    const userId = docSnap.id;

    const isCurrentAdmin = currentUser.uid === userId;

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>${user.name || "No Name"}</h3>
      <p><strong>Email:</strong> ${user.email || ""}</p>
      <p><strong>Phone:</strong> ${user.phone || ""}</p>
      <p><strong>Role:</strong> ${user.role || ""}</p>
      <p><strong>Approved:</strong> ${user.approved === true ? "Yes" : "No"}</p>
      <p><strong>Blocked:</strong> ${user.blocked === true ? "Yes" : "No"}</p>

      <div class="seller-actions">
        ${
          user.role === "seller" && user.approved !== true
            ? `<button class="approve-btn">Approve Seller</button>`
            : ""
        }

        <button class="toggle-btn">${user.blocked ? "Unblock" : "Block"}</button>

        ${
          !isCurrentAdmin
            ? `<button class="danger-btn">Delete Profile</button>`
            : `<button disabled>Current Admin</button>`
        }
      </div>
    `;

    const approveBtn = div.querySelector(".approve-btn");
    if (approveBtn) {
      approveBtn.addEventListener("click", async () => {
        await updateDoc(doc(db, "users", userId), {
          approved: true,
          blocked: false,
          updatedAt: serverTimestamp()
        });
        await loadUsers();
      });
    }

    div.querySelector(".toggle-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "users", userId), {
        blocked: !user.blocked,
        updatedAt: serverTimestamp()
      });
      await loadUsers();
    });

    const deleteBtn = div.querySelector(".danger-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!confirm("Delete this Firestore user profile? This does not delete Firebase Auth login.")) return;

        await deleteDoc(doc(db, "users", userId));
        await loadUsers();
      });
    }

    usersList.appendChild(div);
  });
}
