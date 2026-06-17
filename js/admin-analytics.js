import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const totalUsers = document.getElementById("totalUsers");
const totalSellers = document.getElementById("totalSellers");
const totalCustomers = document.getElementById("totalCustomers");
const totalProducts = document.getElementById("totalProducts");
const totalOrders = document.getElementById("totalOrders");
const totalRevenue = document.getElementById("totalRevenue");
const recentOrders = document.getElementById("recentOrders");

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

  await loadAnalytics();
});

async function loadAnalytics() {
  const usersSnap = await getDocs(collection(db, "users"));
  const productsSnap = await getDocs(collection(db, "products"));
  const ordersSnap = await getDocs(collection(db, "orders"));

  let sellers = 0;
  let customers = 0;
  let revenue = 0;

  usersSnap.forEach((docSnap) => {
    const user = docSnap.data();
    if (user.role === "seller") sellers++;
    if (user.role === "customer") customers++;
  });

  ordersSnap.forEach((docSnap) => {
    const order = docSnap.data();
    if (order.paymentStatus === "verified") {
      revenue += Number(order.grandTotal || 0);
    }
  });

  totalUsers.textContent = usersSnap.size;
  totalSellers.textContent = sellers;
  totalCustomers.textContent = customers;
  totalProducts.textContent = productsSnap.size;
  totalOrders.textContent = ordersSnap.size;
  totalRevenue.textContent = revenue;

  await loadRecentOrders();
}

async function loadRecentOrders() {
  const q = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc"),
    limit(8)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    recentOrders.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  recentOrders.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const order = docSnap.data();

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>Order #${docSnap.id.slice(0, 8)}</h3>
      <p><strong>Customer:</strong> ${order.customerName || ""}</p>
      <p><strong>Total:</strong> Rs ${order.grandTotal || 0}</p>
      <p><strong>Payment:</strong> ${order.paymentStatus || ""}</p>
      <p><strong>Status:</strong> ${order.orderStatus || ""}</p>
    `;

    recentOrders.appendChild(div);
  });
}
