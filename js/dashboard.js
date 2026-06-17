import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const welcome = document.getElementById("welcome");
const statusText = document.getElementById("status");
const actions = document.getElementById("actions");
const logoutBtn = document.getElementById("logoutBtn");

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

  welcome.textContent = `Welcome, ${data.name}`;

  if (data.role === "admin") {
    actions.innerHTML = `
      <a class="card link-card" href="admin.html">
        <h3>Admin Dashboard</h3>
        <p>Approve sellers and manage MauMarket.</p>
      </a>
    `;
    return;
  }

  if (data.role === "seller") {
    if (!data.approved) {
      statusText.textContent = "Your seller account is waiting for admin approval.";
      return;
    }

    actions.innerHTML = `
      <a class="card link-card" href="seller.html">
        <h3>Seller Dashboard</h3>
        <p>Create or update your shop profile.</p>
      </a>
    `;
    return;
  }

  actions.innerHTML = `
    <div class="card">
      <h3>Customer Account</h3>
      <p>Marketplace shopping will be added in Phase 2.</p>
    </div>
  `;
});
