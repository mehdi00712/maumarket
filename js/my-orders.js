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

    const itemsHtml = (order.items || []).map(item => `
      <li>${item.title} — Rs ${item.price} x ${item.quantity}</li>
    `).join("");

    const paymentButton = order.paymentStatus === "not_paid" || order.paymentStatus === "rejected"
      ? `<a class="btn" href="payment.html?id=${docSnap.id}">Pay with Juice</a>`
      : "";

    const proofButton = order.paymentProofUrl
      ? `<a class="small-link" href="${order.paymentProofUrl}" target="_blank">View Payment Proof</a>`
      : "";

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${docSnap.id.slice(0, 8)}</h3>

      <div class="tracking-box">
        <span class="${getStepClass(order.orderStatus, "Pending Payment")}">Pending</span>
        <span class="${getStepClass(order.orderStatus, "Payment Submitted")}">Submitted</span>
        <span class="${getStepClass(order.orderStatus, "Preparing Order")}">Preparing</span>
        <span class="${getStepClass(order.orderStatus, "Ready for Pickup")}">Ready</span>
        <span class="${getStepClass(order.orderStatus, "Out for Delivery")}">Delivery</span>
        <span class="${getStepClass(order.orderStatus, "Delivered")}">Delivered</span>
      </div>

      <p><strong>Status:</strong> ${order.orderStatus}</p>
      <p><strong>Payment:</strong> ${order.paymentStatus}</p>
      <p><strong>Total:</strong> Rs ${order.grandTotal}</p>
      <p><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>
      ${order.deliveryNote ? `<p><strong>Delivery Note:</strong> ${order.deliveryNote}</p>` : ""}

      <h4>Items</h4>
      <ul>${itemsHtml}</ul>

      ${paymentButton}
      ${proofButton}
    `;

    ordersList.appendChild(div);
  });
}

function getStepClass(currentStatus, stepStatus) {
  const order = [
    "Pending Payment",
    "Payment Submitted",
    "Preparing Order",
    "Ready for Pickup",
    "Picked Up",
    "Out for Delivery",
    "Delivered"
  ];

  const currentIndex = order.indexOf(currentStatus);
  const stepIndex = order.indexOf(stepStatus);

  if (currentStatus === "Payment Rejected" || currentStatus === "Cancelled") {
    return "track-step cancelled";
  }

  return currentIndex >= stepIndex ? "track-step done" : "track-step";
}
