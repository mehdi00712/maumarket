import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const quotaList = document.getElementById("quotaList");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const adminSnap = await getDoc(doc(db, "users", user.uid));

  if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  loadRequests();
});

async function loadRequests() {
  quotaList.innerHTML = "Loading requests...";

  const q = query(
    collection(db, "quotaRequests"),
    where("status", "==", "pending")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    quotaList.innerHTML = "<p>No pending slot requests.</p>";
    return;
  }

  quotaList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const req = docSnap.data();

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>${req.sellerName || "Seller"}</h3>
      <p><strong>Email:</strong> ${req.sellerEmail || ""}</p>
      <p><strong>Current Limit:</strong> ${req.currentLimit}</p>
      <p><strong>Requested Extra:</strong> ${req.requestedExtra}</p>
      <p><strong>New Limit:</strong> ${Number(req.currentLimit) + Number(req.requestedExtra)}</p>

      <div class="seller-actions">
        <button class="approve-btn">Approve</button>
        <button class="danger-btn">Reject</button>
      </div>
    `;

    div.querySelector(".approve-btn").addEventListener("click", async () => {
      const newLimit = Number(req.currentLimit) + Number(req.requestedExtra);

      await updateDoc(doc(db, "users", req.sellerId), {
        productLimit: newLimit,
        updatedAt: serverTimestamp()
      });

      await updateDoc(doc(db, "quotaRequests", docSnap.id), {
        status: "approved",
        approvedLimit: newLimit,
        updatedAt: serverTimestamp()
      });

      loadRequests();
    });

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "quotaRequests", docSnap.id), {
        status: "rejected",
        updatedAt: serverTimestamp()
      });

      loadRequests();
    });

    quotaList.appendChild(div);
  });
}
