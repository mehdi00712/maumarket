import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const orderBox = document.getElementById("orderBox");
const sellerRating = document.getElementById("sellerRating");
const deliveryRating = document.getElementById("deliveryRating");
const reviewText = document.getElementById("reviewText");
const submitReviewBtn = document.getElementById("submitReviewBtn");
const reviewMessage = document.getElementById("reviewMessage");

const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");

let currentUser = null;
let currentOrder = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadOrder();
});

async function loadOrder() {
  if (!orderId) {
    orderBox.innerHTML = "<p>Order not found.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  const orderSnap = await getDoc(doc(db, "orders", orderId));

  if (!orderSnap.exists()) {
    orderBox.innerHTML = "<p>Order not found.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  currentOrder = {
    id: orderSnap.id,
    ...orderSnap.data()
  };

  if (currentOrder.customerId !== currentUser.uid) {
    orderBox.innerHTML = "<p>You cannot review this order.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  if (currentOrder.orderStatus !== "Delivered") {
    orderBox.innerHTML = "<p>You can review only after delivery.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  const existingQ = query(
    collection(db, "reviews"),
    where("orderId", "==", orderId),
    where("customerId", "==", currentUser.uid)
  );

  const existingSnap = await getDocs(existingQ);

  if (!existingSnap.empty) {
    orderBox.innerHTML = "<p>You already reviewed this order.</p>";
    submitReviewBtn.disabled = true;
    return;
  }

  const itemsHtml = (currentOrder.items || []).map(item => `
    <li>${item.title} — Rs ${item.price} x ${item.quantity}</li>
  `).join("");

  orderBox.innerHTML = `
    <div class="order-card">
      <h3>Order #${orderId.slice(0, 8)}</h3>
      <p><strong>Total:</strong> Rs ${currentOrder.grandTotal || 0}</p>
      <p><strong>Status:</strong> ${currentOrder.orderStatus}</p>
      <h4>Items</h4>
      <ul>${itemsHtml}</ul>
    </div>
  `;
}

submitReviewBtn.addEventListener("click", async () => {
  if (!currentUser || !currentOrder) return;

  const text = reviewText.value.trim();

  if (!text) {
    reviewMessage.textContent = "Please write a short review.";
    return;
  }

  submitReviewBtn.disabled = true;
  reviewMessage.textContent = "Submitting review...";

  try {
    const productIds = (currentOrder.items || [])
      .map(item => item.productId)
      .filter(Boolean);

    await addDoc(collection(db, "reviews"), {
      orderId,
      customerId: currentUser.uid,
      customerEmail: currentUser.email,
      customerName: currentOrder.customerName || "Customer",

      sellerIds: currentOrder.sellerIds || [],
      productIds,

      sellerRating: Number(sellerRating.value),
      deliveryRating: Number(deliveryRating.value),
      reviewText: text,

      createdAt: serverTimestamp()
    });

    reviewMessage.textContent = "Review submitted successfully.";

    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 900);
  } catch (error) {
    reviewMessage.textContent = error.message;
    submitReviewBtn.disabled = false;
  }
});
