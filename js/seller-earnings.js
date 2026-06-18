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
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const sellerSales = document.getElementById("sellerSales");
const sellerEarnings = document.getElementById("sellerEarnings");
const sellerCommission = document.getElementById("sellerCommission");
const sellerEarningsOrders = document.getElementById("sellerEarningsOrders");

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
    userSnap.data().role !== "seller" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadEarnings();
});

async function loadEarnings() {
  sellerEarningsOrders.innerHTML = "Loading earnings...";

  const q = query(
    collection(db, "orders"),
    where("sellerIds", "array-contains", currentUser.uid),
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
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  let totalSales = 0;
  let totalEarnings = 0;
  let totalCommission = 0;

  sellerEarningsOrders.innerHTML = "";

  if (orders.length === 0) {
    sellerEarningsOrders.innerHTML = "<p>No verified sales yet.</p>";
  }

  orders.forEach((order) => {
    const sellerItems = (order.items || []).filter(item => item.sellerId === currentUser.uid);

    let sellerItemsTotal = 0;

    sellerItems.forEach(item => {
      sellerItemsTotal += Number(item.price || 0) * Number(item.quantity || 1);
    });

    const commissionRate = Number(order.commissionRate || 0.10);
    const orderCommission = Math.round(sellerItemsTotal * commissionRate);
    const orderEarnings = sellerItemsTotal - orderCommission;

    totalSales += sellerItemsTotal;
    totalCommission += orderCommission;
    totalEarnings += orderEarnings;

    const itemsHtml = sellerItems.map(item => `
      <li>${item.title} — Rs ${item.price} x ${item.quantity}</li>
    `).join("");

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${order.id.slice(0, 8)}</h3>
      <p><strong>Status:</strong> ${order.orderStatus || ""}</p>
      <p><strong>Sales:</strong> Rs ${sellerItemsTotal}</p>
      <p><strong>Commission:</strong> Rs ${orderCommission}</p>
      <p><strong>Your Earnings:</strong> Rs ${orderEarnings}</p>

      <h4>Items Sold</h4>
      <ul>${itemsHtml}</ul>
    `;

    sellerEarningsOrders.appendChild(div);
  });

  sellerSales.textContent = totalSales;
  sellerCommission.textContent = totalCommission;
  sellerEarnings.textContent = totalEarnings;
}
