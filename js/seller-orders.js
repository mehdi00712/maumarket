import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const sellerOrdersList = document.getElementById("sellerOrdersList");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadSellerOrders();
});

async function loadSellerOrders() {
  sellerOrdersList.innerHTML = "Loading orders...";

  const q = query(
    collection(db, "orders"),
    where("sellerIds", "array-contains", currentUser.uid),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    sellerOrdersList.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  sellerOrdersList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const order = docSnap.data();

    if (order.paymentStatus !== "verified") {
      return;
    }

    const sellerItems = (order.items || []).filter(item => item.sellerId === currentUser.uid);

    const itemsHtml = sellerItems.map(item => `
      <li>${item.title} — Rs ${item.price} x ${item.quantity}</li>
    `).join("");

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${docSnap.id.slice(0, 8)}</h3>
      <p><strong>Customer:</strong> ${order.customerName}</p>
      <p><strong>Phone:</strong> ${order.customerPhone}</p>
      <p><strong>Address:</strong> ${order.deliveryAddress}</p>
      <p><strong>Status:</strong> ${order.orderStatus}</p>
      <p><strong>Payment:</strong> ${order.paymentStatus}</p>

      <h4>Your Items</h4>
      <ul>${itemsHtml}</ul>

      <button class="ready-btn">Mark Ready for Pickup</button>
    `;

    div.querySelector(".ready-btn").addEventListener("click", async () => {
      await updateDoc(doc(db, "orders", docSnap.id), {
        orderStatus: "Ready for Pickup",
        sellerReadyAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await loadSellerOrders();
    });

    sellerOrdersList.appendChild(div);
  });

  if (!sellerOrdersList.innerHTML.trim()) {
    sellerOrdersList.innerHTML = "<p>No verified orders yet.</p>";
  }
}
