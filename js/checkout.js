import { auth, db, storage } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const deliveryAddress = document.getElementById("deliveryAddress");
const orderNotes = document.getElementById("orderNotes");
const paymentProof = document.getElementById("paymentProof");

const checkoutItems = document.getElementById("checkoutItems");
const itemsTotalEl = document.getElementById("itemsTotal");
const deliveryFeeEl = document.getElementById("deliveryFee");
const grandTotalEl = document.getElementById("grandTotal");
const placeOrderBtn = document.getElementById("placeOrderBtn");
const checkoutMessage = document.getElementById("checkoutMessage");

const DELIVERY_FEE = 150;
const COMMISSION_RATE = 0.10;

let currentUser = null;
let cartItems = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  await loadCheckout();
});

async function loadCheckout() {
  checkoutItems.innerHTML = "Loading...";

  const snapshot = await getDocs(
    collection(db, "carts", currentUser.uid, "items")
  );

  cartItems = [];

  if (snapshot.empty) {
    checkoutItems.innerHTML = `
      <div class="order-card">
        <h3>Your cart is empty</h3>
        <p>Add items from the marketplace before checkout.</p>
        <a class="btn" href="products.html">Go to Marketplace</a>
      </div>
    `;

    placeOrderBtn.disabled = true;
    updateTotals(0);
    return;
  }

  let itemsTotal = 0;
  checkoutItems.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const rawItem = {
      cartItemId: docSnap.id,
      ...docSnap.data()
    };

    const buyerPrice = getBuyerPrice(rawItem);
    const sellerPrice = getSellerPrice(rawItem);
    const commissionAmount = getCommissionAmount(rawItem);
    const quantity = Number(rawItem.quantity || 1);
    const subtotal = roundMoney(buyerPrice * quantity);
    const sellerSubtotal = roundMoney(sellerPrice * quantity);
    const commissionSubtotal = roundMoney(commissionAmount * quantity);

    const item = {
      ...rawItem,
      price: buyerPrice,
      buyerPrice,
      sellerPrice,
      commissionAmount,
      commissionRate: COMMISSION_RATE,
      quantity,
      subtotal,
      sellerSubtotal,
      commissionSubtotal
    };

    itemsTotal += subtotal;
    cartItems.push(item);

    const div = document.createElement("div");
    div.className = "checkout-line checkout-pro-line";

    div.innerHTML = `
      <div class="checkout-line-main">
        ${
          item.imageUrl
            ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Product")}">`
            : `<div class="checkout-no-img">No Image</div>`
        }

        <div>
          <strong>${escapeHtml(item.title || "Untitled")}</strong>
          <p>${escapeHtml(item.shopName || "MauMarket Seller")}</p>
          <p class="buyer-price-note">Final price includes MauMarket commission</p>
        </div>
      </div>

      <div class="checkout-line-price">
        <span>${formatRs(buyerPrice)} x ${quantity}</span>
        <strong>${formatRs(subtotal)}</strong>
      </div>
    `;

    checkoutItems.appendChild(div);
  });

  updateTotals(itemsTotal);
}

function updateTotals(itemsTotal) {
  const grandTotal = roundMoney(Number(itemsTotal || 0) + DELIVERY_FEE);

  if (itemsTotalEl) {
    itemsTotalEl.textContent = formatPlainNumber(itemsTotal);
  }

  if (deliveryFeeEl) {
    deliveryFeeEl.textContent = formatPlainNumber(DELIVERY_FEE);
  }

  if (grandTotalEl) {
    grandTotalEl.textContent = formatPlainNumber(grandTotal);
  }
}

placeOrderBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  if (
    !customerName.value.trim() ||
    !customerPhone.value.trim() ||
    !deliveryAddress.value.trim()
  ) {
    checkoutMessage.textContent = "Please fill name, phone, and delivery address.";
    return;
  }

  if (!paymentProof.files[0]) {
    checkoutMessage.textContent = "Please upload your Juice payment screenshot before placing the order.";
    return;
  }

  if (cartItems.length === 0) {
    checkoutMessage.textContent = "Your cart is empty.";
    return;
  }

  placeOrderBtn.disabled = true;
  checkoutMessage.textContent = "Uploading proof and creating order...";

  try {
    const itemsTotal = roundMoney(
      cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
    );

    const deliveryFee = DELIVERY_FEE;
    const grandTotal = roundMoney(itemsTotal + deliveryFee);

    const commissionAmount = roundMoney(
      cartItems.reduce((sum, item) => sum + Number(item.commissionSubtotal || 0), 0)
    );

    const sellerAmount = roundMoney(
      cartItems.reduce((sum, item) => sum + Number(item.sellerSubtotal || 0), 0)
    );

    const sellerIds = [
      ...new Set(
        cartItems
          .map((item) => item.sellerId)
          .filter(Boolean)
      )
    ];

    const sellerBreakdown = buildSellerBreakdown(cartItems);

    const file = paymentProof.files[0];
    const safeName = file.name.replaceAll(" ", "-");
    const fileRef = ref(
      storage,
      `payments/${currentUser.uid}/${Date.now()}-${safeName}`
    );

    await uploadBytes(fileRef, file);
    const proofUrl = await getDownloadURL(fileRef);

    const orderItems = cartItems.map((item) => ({
      productId: item.productId || item.cartItemId,
      sellerId: item.sellerId || "",
      title: item.title || "",
      type: item.type || "",
      category: item.category || "",
      imageUrl: item.imageUrl || "",
      shopName: item.shopName || "",
      quantity: Number(item.quantity || 1),

      price: Number(item.buyerPrice || item.price || 0),
      buyerPrice: Number(item.buyerPrice || item.price || 0),
      sellerPrice: Number(item.sellerPrice || 0),
      commissionAmount: Number(item.commissionAmount || 0),
      commissionRate: COMMISSION_RATE,

      subtotal: Number(item.subtotal || 0),
      sellerSubtotal: Number(item.sellerSubtotal || 0),
      commissionSubtotal: Number(item.commissionSubtotal || 0)
    }));

    await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerEmail: currentUser.email,

      customerName: customerName.value.trim(),
      customerPhone: customerPhone.value.trim(),
      deliveryAddress: deliveryAddress.value.trim(),
      orderNotes: orderNotes.value.trim(),

      items: orderItems,
      sellerIds,
      sellerBreakdown,

      itemsTotal,
      deliveryFee,
      grandTotal,

      commissionRate: COMMISSION_RATE,
      commissionAmount,
      sellerAmount,

      paymentMethod: "Juice",
      paymentStatus: "submitted",
      paymentProofUrl: proofUrl,
      paymentSubmittedAt: serverTimestamp(),

      orderStatus: "Payment Submitted",
      deliveryStatus: "Pending",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    for (const item of cartItems) {
      await deleteDoc(doc(db, "carts", currentUser.uid, "items", item.cartItemId));
    }

    checkoutMessage.textContent = "Order placed. Waiting for admin payment verification.";

    setTimeout(() => {
      window.location.href = "my-orders.html";
    }, 1200);
  } catch (error) {
    checkoutMessage.textContent = error.message;
    placeOrderBtn.disabled = false;
  }
});

function buildSellerBreakdown(items) {
  const breakdown = {};

  items.forEach((item) => {
    const sellerId = item.sellerId || "unknown";

    if (!breakdown[sellerId]) {
      breakdown[sellerId] = {
        sellerId,
        shopName: item.shopName || "Unknown Shop",
        itemCount: 0,
        itemsTotal: 0,
        sellerAmount: 0,
        commissionAmount: 0
      };
    }

    breakdown[sellerId].itemCount += Number(item.quantity || 1);
    breakdown[sellerId].itemsTotal = roundMoney(
      breakdown[sellerId].itemsTotal + Number(item.subtotal || 0)
    );
    breakdown[sellerId].sellerAmount = roundMoney(
      breakdown[sellerId].sellerAmount + Number(item.sellerSubtotal || 0)
    );
    breakdown[sellerId].commissionAmount = roundMoney(
      breakdown[sellerId].commissionAmount + Number(item.commissionSubtotal || 0)
    );
  });

  return Object.values(breakdown);
}

function getBuyerPrice(item) {
  const buyerPrice = Number(item.buyerPrice || 0);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice);
  }

  const price = Number(item.price || 0);

  if (price > 0) {
    return roundMoney(price);
  }

  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice * (1 + COMMISSION_RATE));
  }

  return 0;
}

function getSellerPrice(item) {
  const sellerPrice = Number(item.sellerPrice || 0);

  if (sellerPrice > 0) {
    return roundMoney(sellerPrice);
  }

  const buyerPrice = getBuyerPrice(item);

  if (buyerPrice > 0) {
    return roundMoney(buyerPrice / (1 + COMMISSION_RATE));
  }

  return 0;
}

function getCommissionAmount(item) {
  const commissionAmount = Number(item.commissionAmount || 0);

  if (commissionAmount > 0) {
    return roundMoney(commissionAmount);
  }

  const sellerPrice = getSellerPrice(item);
  const buyerPrice = getBuyerPrice(item);

  return roundMoney(Math.max(0, buyerPrice - sellerPrice));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatRs(value) {
  return `Rs ${formatPlainNumber(value)}`;
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
