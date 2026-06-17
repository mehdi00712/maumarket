import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ordersList = document.getElementById("ordersList");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadOrders();
});

async function loadOrders() {
  ordersList.innerHTML = "Loading orders...";

  const q = query(
    collection(db, "orders"),
    where("customerId", "==", currentUser.uid),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    ordersList.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  ordersList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const order = docSnap.data();

    const itemsHtml = order.items.map(item => `
      <li>${item.title} — Rs ${item.price} x ${item.quantity}</li>
    `).join("");

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${docSnap.id.slice(0, 8)}</h3>
      <p><strong>Status:</strong> ${order.orderStatus}</p>
      <p><strong>Payment:</strong> ${order.paymentStatus}</p>
      <p><strong>Total:</strong> Rs ${order.grandTotal}</p>
      <p><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>

      <h4>Items</h4>
      <ul>${itemsHtml}</ul>
    `;

    ordersList.appendChild(div);
  });
}
