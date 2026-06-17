import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const payoutsList = document.getElementById("payoutsList");

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

  await loadPayouts();
});

async function loadPayouts() {
  payoutsList.innerHTML = "Loading payouts...";

  const ordersQuery = query(
    collection(db, "orders"),
    where("paymentStatus", "==", "verified"),
    orderBy("createdAt", "desc")
  );

  const ordersSnap = await getDocs(ordersQuery);

  const payoutsSnap = await getDocs(collection(db, "payouts"));

  const paidBySeller = {};
  payoutsSnap.forEach((docSnap) => {
    const payout = docSnap.data();
    paidBySeller[payout.sellerId] = (paidBySeller[payout.sellerId] || 0) + Number(payout.amount || 0);
  });

  const sellerTotals = {};

  ordersSnap.forEach((docSnap) => {
    const order = docSnap.data();

    (order.items || []).forEach((item) => {
      const sellerId = item.sellerId;
      const itemTotal = Number(item.price || 0) * Number(item.quantity || 1);
      const commissionRate = Number(order.commissionRate || 0.10);
      const commission = Math.round(itemTotal * commissionRate);
      const earning = itemTotal - commission;

      if (!sellerTotals[sellerId]) {
        sellerTotals[sellerId] = {
          sellerId,
          shopName: item.shopName || "Seller",
          totalSales: 0,
          totalCommission: 0,
          totalEarnings: 0
        };
      }

      sellerTotals[sellerId].totalSales += itemTotal;
      sellerTotals[sellerId].totalCommission += commission;
      sellerTotals[sellerId].totalEarnings += earning;
    });
  });

  const sellers = Object.values(sellerTotals);

  if (sellers.length === 0) {
    payoutsList.innerHTML = "<p>No seller earnings yet.</p>";
    return;
  }

  payoutsList.innerHTML = "";

  sellers.forEach((seller) => {
    const alreadyPaid = paidBySeller[seller.sellerId] || 0;
    const pending = seller.totalEarnings - alreadyPaid;

    const div = document.createElement("div");
    div.className = "order-card";

    div.innerHTML = `
      <h3>${seller.shopName}</h3>
      <p><strong>Total Sales:</strong> Rs ${seller.totalSales}</p>
      <p><strong>Commission:</strong> Rs ${seller.totalCommission}</p>
      <p><strong>Total Earnings:</strong> Rs ${seller.totalEarnings}</p>
      <p><strong>Already Paid:</strong> Rs ${alreadyPaid}</p>
      <h2>Pending Payout: Rs ${pending}</h2>

      <button class="approve-btn" ${pending <= 0 ? "disabled" : ""}>Mark Paid</button>
    `;

    div.querySelector(".approve-btn").addEventListener("click", async () => {
      if (pending <= 0) return;

      const confirmPay = confirm(`Mark Rs ${pending} as paid to ${seller.shopName}?`);
      if (!confirmPay) return;

      await addDoc(collection(db, "payouts"), {
        sellerId: seller.sellerId,
        shopName: seller.shopName,
        amount: pending,
        status: "paid",
        paidAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      await loadPayouts();
    });

    payoutsList.appendChild(div);
  });
}
