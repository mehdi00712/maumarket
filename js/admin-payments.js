import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

const paymentsList = document.getElementById("paymentsList");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", currentUser.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "admin" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadPayments();
});

async function loadPayments() {
  paymentsList.innerHTML = "Loading payments...";

  const q = query(
    collection(db, "orders"),
    where("paymentStatus", "==", "submitted")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    paymentsList.innerHTML = "<p>No payment proofs waiting for verification.</p>";
    return;
  }

  const orders = [];
  snapshot.forEach((docSnap) => {
    orders.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  orders.sort((a, b) => {
    const aTime = a.paymentSubmittedAt?.seconds || 0;
    const bTime = b.paymentSubmittedAt?.seconds || 0;
    return bTime - aTime;
  });

  paymentsList.innerHTML = "";

  orders.forEach((order) => {
    const itemsHtml = (order.items || []).map(item => `
      <li>${item.title} — Rs ${item.price} x ${item.quantity}</li>
    `).join("");

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${order.id.slice(0, 8)}</h3>
      <p><strong>Customer:</strong> ${order.customerName || ""}</p>
      <p><strong>Phone:</strong> ${order.customerPhone || ""}</p>
      <p><strong>Total Paid:</strong> Rs ${order.grandTotal || 0}</p>
      <p><strong>Commission:</strong> Rs ${order.commissionAmount || 0}</p>
      <p><strong>Seller Amount:</strong> Rs ${order.sellerAmount || 0}</p>

      <h4>Items</h4>
      <ul>${itemsHtml}</ul>

      ${
        order.paymentProofUrl
          ? `<a class="btn" href="${order.paymentProofUrl}" target="_blank">View Payment Screenshot</a>`
          : `<p>No proof uploaded.</p>`
      }

      <div class="seller-actions">
        <button class="approve-btn">Approve Payment</button>
        <button class="danger-btn">Reject Payment</button>
      </div>
    `;

    div.querySelector(".approve-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "orders", order.id), {
        paymentStatus: "verified",
        orderStatus: "Preparing Order",
        paymentVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await loadPayments();
    });

    div.querySelector(".danger-btn").addEventListener("click", async () => {
      const reason = prompt("Reason for rejecting payment:");

      await updateDoc(doc(db, "orders", order.id), {
        paymentStatus: "rejected",
        orderStatus: "Payment Rejected",
        paymentRejectReason: reason || "",
        updatedAt: serverTimestamp()
      });

      await loadPayments();
    });

    paymentsList.appendChild(div);
  });
}
