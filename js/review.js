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
  serverTimestamp,
  updateDoc,
  increment
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
    <li>
      ${escapeHtml(item.title || "Item")}
      — Rs ${Number(item.price || 0)}
      x ${Number(item.quantity || 1)}
      ${item.shopName ? `— ${escapeHtml(item.shopName)}` : ""}
    </li>
  `).join("");

  orderBox.innerHTML = `
    <div class="order-card">
      <h3>Order #${orderId.slice(0, 8)}</h3>
      <p><strong>Total:</strong> Rs ${Number(currentOrder.grandTotal || 0)}</p>
      <p><strong>Status:</strong> ${escapeHtml(currentOrder.orderStatus || "")}</p>

      <h4>Items</h4>
      <ul>${itemsHtml || "<li>No items found.</li>"}</ul>
    </div>
  `;
}

submitReviewBtn.addEventListener("click", async () => {
  if (!currentUser || !currentOrder) return;

  const text = reviewText.value.trim();
  const sellerRatingValue = Number(sellerRating.value || 0);
  const deliveryRatingValue = Number(deliveryRating.value || 0);

  if (sellerRatingValue < 1 || sellerRatingValue > 5) {
    reviewMessage.textContent = "Please select a seller rating from 1 to 5.";
    return;
  }

  if (deliveryRatingValue < 1 || deliveryRatingValue > 5) {
    reviewMessage.textContent = "Please select a delivery rating from 1 to 5.";
    return;
  }

  if (!text) {
    reviewMessage.textContent = "Please write a short review.";
    return;
  }

  submitReviewBtn.disabled = true;
  reviewMessage.textContent = "Submitting review...";

  try {
    const items = currentOrder.items || [];

    const productIds = [...new Set(
      items
        .map(item => item.productId)
        .filter(Boolean)
    )];

    const sellerIds = [...new Set(
      items
        .map(item => item.sellerId)
        .filter(Boolean)
    )];

    await addDoc(collection(db, "reviews"), {
      orderId,
      customerId: currentUser.uid,
      customerEmail: currentUser.email || "",
      customerName: currentOrder.customerName || "Customer",

      sellerIds,
      productIds,

      sellerRating: sellerRatingValue,
      deliveryRating: deliveryRatingValue,
      rating: sellerRatingValue,
      reviewText: text,

      orderTotal: Number(currentOrder.grandTotal || 0),
      verifiedPurchase: true,

      createdAt: serverTimestamp()
    });

    await updateProductRatings(productIds, sellerRatingValue);
    await updateSellerRatings(sellerIds, sellerRatingValue);

    reviewMessage.textContent = "Review submitted successfully.";

    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 900);
  } catch (error) {
    reviewMessage.textContent = error.message;
    submitReviewBtn.disabled = false;
  }
});

async function updateProductRatings(productIds, ratingValue) {
  const updates = productIds.map(async (productId) => {
    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) return;

    const product = productSnap.data();
    const oldTotalReviews = Number(product.totalReviews || 0);
    const oldRatingSum = Number(product.ratingSum || 0);

    const newTotalReviews = oldTotalReviews + 1;
    const newRatingSum = oldRatingSum + ratingValue;
    const averageRating = Number((newRatingSum / newTotalReviews).toFixed(1));

    await updateDoc(productRef, {
      totalReviews: increment(1),
      ratingSum: increment(ratingValue),
      averageRating
    });
  });

  await Promise.all(updates);
}

async function updateSellerRatings(sellerIds, ratingValue) {
  const updates = sellerIds.map(async (sellerId) => {
    const shopRef = doc(db, "shops", sellerId);
    const shopSnap = await getDoc(shopRef);

    if (!shopSnap.exists()) return;

    const shop = shopSnap.data();
    const oldTotalReviews = Number(shop.totalReviews || 0);
    const oldRatingSum = Number(shop.ratingSum || 0);

    const newTotalReviews = oldTotalReviews + 1;
    const newRatingSum = oldRatingSum + ratingValue;
    const averageRating = Number((newRatingSum / newTotalReviews).toFixed(1));

    await updateDoc(shopRef, {
      totalReviews: increment(1),
      ratingSum: increment(ratingValue),
      averageRating
    });
  });

  await Promise.all(updates);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
