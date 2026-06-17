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
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const totalSales = document.getElementById("totalSales");
const totalCommission = document.getElementById("totalCommission");
const totalSellerPayout = document.getElementById("totalSellerPayout");
const totalDeliveryFees = document.getElementById("totalDeliveryFees");
const commissionOrders = document.getElementById("commissionOrders");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (!userSnap.exists() || userSnap.data().role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  await loadCommission();
});

async function loadCommission() {
  commissionOrders.innerHTML = "Loading orders...";

  const q = query(
    collection(db, "orders"),
    where("paymentStatus", "==", "verified"),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  let sales = 0;
  let commission = 0;
  let sellerPayout = 0;
  let deliveryFees = 0;

  commissionOrders.innerHTML = "";

  if (snapshot.empty) {
    commissionOrders.innerHTML = "<p>No verified orders yet.</p>";
  }

  snapshot.forEach((docSnap) => {
    const order = docSnap.data();

    sales += Number(order.grandTotal || 0);
    commission += Number(order.commissionAmount || 0);
    sellerPayout += Number(order.sellerAmount || 0);
    deliveryFees += Number(order.deliveryFee || 0);

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${docSnap.id.slice(0, 8)}</h3>
      <p><strong>Customer:</strong> ${order.customerName}</p>
      <p><strong>Total:</strong> Rs ${order.grandTotal || 0}</p>
      <p><strong>Commission:</strong> Rs ${order.commissionAmount || 0}</p>
      <p><strong>Seller Payout:</strong> Rs ${order.sellerAmount || 0}</p>
      <p><strong>Delivery Fee:</strong> Rs ${order.deliveryFee || 0}</p>
      <p><strong>Status:</strong> ${order.orderStatus}</p>
    `;

    commissionOrders.appendChild(div);
  });

  totalSales.textContent = sales;
  totalCommission.textContent = commission;
  totalSellerPayout.textContent = sellerPayout;
  totalDeliveryFees.textContent = deliveryFees;
}
