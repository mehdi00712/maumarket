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

  const orders = [];

  snapshot.forEach((docSnap) => {
    orders.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  orders.sort((a, b) => {
    return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
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

    const signatureBox = order.deliverySignature
      ? `
        <div class="form-card">
          <h4>Customer Signature</h4>
          <img src="${order.deliverySignature}" alt="Customer signature" style="max-width:100%; background:#fff; border:1px solid #ddd; border-radius:12px;">
          <p><strong>Signed by:</strong> ${order.deliverySignedBy || "Customer"}</p>
          <p><strong>Delivery guy:</strong> ${order.deliveryGuyName || "Not specified"}</p>
          <p><strong>Delivery note:</strong> ${order.deliveryNote || "None"}</p>
        </div>
      `
      : `<p class="muted">No customer signature submitted yet.</p>`;

    const validateButton = order.orderStatus === "Delivery Submitted"
      ? `<button class="approve-btn validate-delivery-btn">Validate Delivery</button>`
      : "";

    const rejectButton = order.orderStatus === "Delivery Submitted"
      ? `<button class="danger-btn reject-delivery-btn">Reject Delivery</button>`
      : "";

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
          <p><strong>Delivery Status:</strong> ${order.deliveryStatus || "Not started"}</p>
          <p><strong>Total:</strong> Rs ${order.grandTotal || 0}</p>
          <p><strong>Delivery Fee:</strong> Rs ${order.deliveryFee || 0}</p>
        </div>
      </div>

      <h4>Items</h4>
      <ul>${itemsHtml}</ul>

      ${signatureBox}

      <div class="seller-actions">
        ${validateButton}
        ${rejectButton}
      </div>
    `;

    div.querySelector(".validate-delivery-btn")?.addEventListener("click", async () => {
      await updateDoc(doc(db, "orders", order.id), {
        orderStatus: "Delivered",
        deliveryStatus: "validated",
        adminDeliveryValidated: true,
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await loadDeliveryOrders();
    });

    div.querySelector(".reject-delivery-btn")?.addEventListener("click", async () => {
      const reason = prompt("Why are you rejecting this delivery?");

      await updateDoc(doc(db, "orders", order.id), {
        orderStatus: "Out for Delivery",
        deliveryStatus: "rejected",
        adminDeliveryValidated: false,
        adminDeliveryRejectReason: reason || "",
        updatedAt: serverTimestamp()
      });

      await loadDeliveryOrders();
    });

    deliveryOrdersList.appendChild(div);
  });
}
