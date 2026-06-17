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
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const deliveryOrdersList = document.getElementById("deliveryOrdersList");

let currentUser = null;

const DELIVERY_STATUSES = [
  "Preparing Order",
  "Ready for Pickup",
  "Picked Up",
  "Out for Delivery",
  "Delivered",
  "Cancelled"
];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", currentUser.uid));

  if (!userSnap.exists() || userSnap.data().role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  await loadDeliveryOrders();
});

async function loadDeliveryOrders() {
  deliveryOrdersList.innerHTML = "Loading delivery orders...";

  const q = query(
    collection(db, "orders"),
    where("paymentStatus", "==", "verified"),
    orderBy("updatedAt", "desc")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    deliveryOrdersList.innerHTML = "<p>No verified orders yet.</p>";
    return;
  }

  deliveryOrdersList.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const order = docSnap.data();

    const itemsHtml = (order.items || []).map(item => `
      <li>${item.title} — Rs ${item.price} x ${item.quantity} — ${item.shopName || ""}</li>
    `).join("");

    const statusOptions = DELIVERY_STATUSES.map(status => `
      <option value="${status}" ${order.orderStatus === status ? "selected" : ""}>
        ${status}
      </option>
    `).join("");

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${docSnap.id.slice(0, 8)}</h3>

      <div class="order-grid">
        <div>
          <p><strong>Customer:</strong> ${order.customerName}</p>
          <p><strong>Phone:</strong> ${order.customerPhone}</p>
          <p><strong>Address:</strong> ${order.deliveryAddress}</p>
          <p><strong>Notes:</strong> ${order.orderNotes || "None"}</p>
        </div>

        <div>
          <p><strong>Payment:</strong> ${order.paymentStatus}</p>
          <p><strong>Status:</strong> ${order.orderStatus}</p>
          <p><strong>Total:</strong> Rs ${order.grandTotal}</p>
          <p><strong>Delivery Fee:</strong> Rs ${order.deliveryFee}</p>
        </div>
      </div>

      <h4>Items</h4>
      <ul>${itemsHtml}</ul>

      <div class="delivery-control">
        <label>Update Delivery Status</label>
        <select class="status-select">
          ${statusOptions}
        </select>

        <textarea class="delivery-note" placeholder="Delivery note optional">${order.deliveryNote || ""}</textarea>

        <button class="update-status-btn">Update Status</button>
      </div>
    `;

    div.querySelector(".update-status-btn").addEventListener("click", async () => {
      const newStatus = div.querySelector(".status-select").value;
      const deliveryNote = div.querySelector(".delivery-note").value.trim();

      const updateData = {
        orderStatus: newStatus,
        deliveryNote,
        updatedAt: serverTimestamp()
      };

      if (newStatus === "Picked Up") {
        updateData.pickedUpAt = serverTimestamp();
      }

      if (newStatus === "Out for Delivery") {
        updateData.outForDeliveryAt = serverTimestamp();
      }

      if (newStatus === "Delivered") {
        updateData.deliveredAt = serverTimestamp();
      }

      if (newStatus === "Cancelled") {
        updateData.cancelledAt = serverTimestamp();
      }

      await updateDoc(doc(db, "orders", docSnap.id), updateData);
      await loadDeliveryOrders();
    });

    deliveryOrdersList.appendChild(div);
  });
}
