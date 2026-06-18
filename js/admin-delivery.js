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

const deliveryOrdersList = document.getElementById("deliveryOrdersList");

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

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "admin" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadDeliveryOrders();
});

async function loadDeliveryOrders() {
  deliveryOrdersList.innerHTML = "Loading delivery orders...";

  const q = query(
    collection(db, "orders"),
    where("paymentStatus", "==", "verified")
  );

  const snapshot = await getDocs(q);

  let orders = [];

  snapshot.forEach((docSnap) => {
    orders.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  orders.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  if (orders.length === 0) {
    deliveryOrdersList.innerHTML = "<p>No verified orders yet.</p>";
    return;
  }

  deliveryOrdersList.innerHTML = "";

  orders.forEach((order) => {
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
      <h3>Order #${order.id.slice(0, 8)}</h3>

      <div class="order-grid">
        <div>
          <p><strong>Customer:</strong> ${order.customerName || ""}</p>
          <p><strong>Phone:</strong> ${order.customerPhone || ""}</p>
          <p><strong>Address:</strong> ${order.deliveryAddress || ""}</p>
          <p><strong>Notes:</strong> ${order.orderNotes || "None"}</p>
        </div>

        <div>
          <p><strong>Payment:</strong> ${order.paymentStatus || ""}</p>
          <p><strong>Status:</strong> ${order.orderStatus || ""}</p>
          <p><strong>Total:</strong> Rs ${order.grandTotal || 0}</p>
          <p><strong>Delivery Fee:</strong> Rs ${order.deliveryFee || 0}</p>
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

      if (newStatus === "Picked Up") updateData.pickedUpAt = serverTimestamp();
      if (newStatus === "Out for Delivery") updateData.outForDeliveryAt = serverTimestamp();
      if (newStatus === "Delivered") updateData.deliveredAt = serverTimestamp();
      if (newStatus === "Cancelled") updateData.cancelledAt = serverTimestamp();

      await updateDoc(doc(db, "orders", order.id), updateData);
      await loadDeliveryOrders();
    });

    deliveryOrdersList.appendChild(div);
  });
}
