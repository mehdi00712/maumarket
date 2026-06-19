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

const sellerOrdersList = document.getElementById("sellerOrdersList");
const sellerOrdersMenuBtn = document.getElementById("sellerOrdersMenuBtn");
const sellerOrdersNav = document.getElementById("sellerOrdersNav");

let currentUser = null;

sellerOrdersMenuBtn?.addEventListener("click", () => {
  sellerOrdersNav?.classList.toggle("show");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "seller" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadSellerOrders();
});

async function loadSellerOrders() {
  sellerOrdersList.innerHTML = `
    <div class="order-card">
      Loading seller orders...
    </div>
  `;

  try {
    const q = query(
      collection(db, "orders"),
      where("sellerIds", "array-contains", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      sellerOrdersList.innerHTML = `
        <div class="order-card">
          <h3>No orders yet</h3>
          <p>When customers place orders for your products, they will appear here.</p>
        </div>
      `;
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
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    sellerOrdersList.innerHTML = "";

    orders.forEach((order) => {
      const sellerItems = (order.items || []).filter((item) => {
        return item.sellerId === currentUser.uid;
      });

      if (sellerItems.length === 0) return;

      const sellerTotal = sellerItems.reduce((sum, item) => {
        return sum + Number(item.price || 0) * Number(item.quantity || 1);
      }, 0);

      const itemsHtml = sellerItems.map((item) => `
        <li>
          <strong>${item.title || "Item"}</strong>
          — Rs ${Number(item.price || 0)} x ${Number(item.quantity || 1)}
        </li>
      `).join("");

      const canMarkReady =
        order.paymentStatus === "verified" &&
        order.orderStatus !== "Ready for Pickup" &&
        order.orderStatus !== "Picked Up" &&
        order.orderStatus !== "Out for Delivery" &&
        order.orderStatus !== "Delivered" &&
        order.orderStatus !== "Cancelled";

      const paymentNotice =
        order.paymentStatus !== "verified"
          ? `<p class="muted"><strong>Waiting:</strong> Admin has not verified this payment yet.</p>`
          : `<p><strong>Payment:</strong> Verified</p>`;

      const buttonHtml = canMarkReady
        ? `<button class="ready-btn">Mark Ready for Pickup</button>`
        : "";

      const div = document.createElement("div");
      div.className = "order-card";

      div.innerHTML = `
        <h3>Order #${order.id.slice(0, 8)}</h3>

        <div class="tracking-box">
          <span class="${stepClass(order.orderStatus, "Pending Payment")}">Pending</span>
          <span class="${stepClass(order.orderStatus, "Payment Submitted")}">Submitted</span>
          <span class="${stepClass(order.orderStatus, "Preparing Order")}">Preparing</span>
          <span class="${stepClass(order.orderStatus, "Ready for Pickup")}">Ready</span>
          <span class="${stepClass(order.orderStatus, "Out for Delivery")}">Delivery</span>
          <span class="${stepClass(order.orderStatus, "Delivered")}">Delivered</span>
        </div>

        <p><strong>Customer:</strong> ${order.customerName || "Not provided"}</p>
        <p><strong>Phone:</strong> ${order.customerPhone || "Not provided"}</p>
        <p><strong>Address:</strong> ${order.deliveryAddress || "Not provided"}</p>
        <p><strong>Status:</strong> ${order.orderStatus || "Pending Payment"}</p>
        ${paymentNotice}

        <h4>Your Items</h4>
        <ul>${itemsHtml}</ul>

        <p><strong>Your item total:</strong> Rs ${sellerTotal}</p>

        ${buttonHtml}
      `;

      const readyBtn = div.querySelector(".ready-btn");

      readyBtn?.addEventListener("click", async () => {
        readyBtn.disabled = true;
        readyBtn.textContent = "Updating...";

        await updateDoc(doc(db, "orders", order.id), {
          orderStatus: "Ready for Pickup",
          sellerReadyAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await loadSellerOrders();
      });

      sellerOrdersList.appendChild(div);
    });

    if (!sellerOrdersList.innerHTML.trim()) {
      sellerOrdersList.innerHTML = `
        <div class="order-card">
          <h3>No seller items found</h3>
          <p>This order may not contain products from your shop.</p>
        </div>
      `;
    }
  } catch (error) {
    sellerOrdersList.innerHTML = `
      <div class="order-card">
        <h3>Could not load seller orders</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function stepClass(currentStatus, stepStatus) {
  const steps = [
    "Pending Payment",
    "Payment Submitted",
    "Preparing Order",
    "Ready for Pickup",
    "Picked Up",
    "Out for Delivery",
    "Delivered"
  ];

  if (currentStatus === "Payment Rejected" || currentStatus === "Cancelled") {
    return "track-step cancelled";
  }

  const currentIndex = steps.indexOf(currentStatus || "Pending Payment");
  const stepIndex = steps.indexOf(stepStatus);

  return currentIndex >= stepIndex ? "track-step done" : "track-step";
}
