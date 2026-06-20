import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const deliveryOrdersList = document.getElementById("deliveryOrdersList");

let currentUser = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "delivery" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  currentUserData = userSnap.data();

  await loadOrders();
});

async function loadOrders() {
  deliveryOrdersList.innerHTML = `
    <div class="order-card">
      Loading assigned deliveries...
    </div>
  `;

  try {
    const snapshot = await getDocs(collection(db, "orders"));

    const orders = [];

    snapshot.forEach((docSnap) => {
      const order = {
        id: docSnap.id,
        ...docSnap.data()
      };

      if (order.deliveryGuyId === currentUser.uid) {
        orders.push(order);
      }
    });

    const activeOrders = orders
      .filter((order) =>
        order.paymentStatus === "verified" &&
        order.orderStatus !== "Delivered" &&
        order.orderStatus !== "Cancelled"
      )
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

    if (activeOrders.length === 0) {
      deliveryOrdersList.innerHTML = `
        <div class="order-card">
          <h3>No assigned deliveries</h3>
          <p>Admin has not assigned you any active deliveries yet.</p>
        </div>
      `;
      return;
    }

    deliveryOrdersList.innerHTML = "";

    activeOrders.forEach(renderOrderCard);
  } catch (error) {
    deliveryOrdersList.innerHTML = `
      <div class="order-card">
        <h3>Could not load deliveries</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function renderOrderCard(order) {
  const card = document.createElement("div");
  card.className = "order-card";

  const itemsHtml = (order.items || []).map((item) => `
    <li>
      <strong>${item.title || "Item"}</strong>
      — Rs ${Number(item.price || 0)} x ${Number(item.quantity || 1)}
      ${item.shopName ? `— ${item.shopName}` : ""}
    </li>
  `).join("");

  const showPickupButton =
    order.orderStatus === "Ready for Pickup" ||
    order.deliveryStatus === "assigned";

  const showOutButton = order.orderStatus === "Picked Up";

  const showSignatureBox =
    order.orderStatus === "Out for Delivery" ||
    order.deliveryStatus === "rejected";

  card.innerHTML = `
    <h3>Order #${order.id.slice(0, 8)}</h3>

    <div class="tracking-box">
      <span class="${stepClass(order.orderStatus, "Ready for Pickup")}">Ready</span>
      <span class="${stepClass(order.orderStatus, "Picked Up")}">Picked Up</span>
      <span class="${stepClass(order.orderStatus, "Out for Delivery")}">Out</span>
      <span class="${stepClass(order.orderStatus, "Delivery Submitted")}">Submitted</span>
      <span class="${stepClass(order.orderStatus, "Delivered")}">Delivered</span>
    </div>

    <div class="order-grid">
      <div>
        <p><strong>Customer:</strong> ${order.customerName || "Not provided"}</p>
        <p><strong>Phone:</strong> ${order.customerPhone || "Not provided"}</p>
        <p><strong>Address:</strong> ${order.deliveryAddress || "Not provided"}</p>
        <p><strong>Customer Notes:</strong> ${order.orderNotes || "None"}</p>
      </div>

      <div>
        <p><strong>Status:</strong> ${order.orderStatus || "Not started"}</p>
        <p><strong>Delivery Status:</strong> ${order.deliveryStatus || "assigned"}</p>
        <p><strong>Total:</strong> Rs ${order.grandTotal || 0}</p>
        <p><strong>Delivery Fee:</strong> Rs ${order.deliveryFee || 0}</p>
      </div>
    </div>

    <h4>Items</h4>
    <ul>${itemsHtml || "<li>No items found.</li>"}</ul>

    ${
      order.adminDeliveryRejectReason
        ? `<p class="muted"><strong>Admin reject reason:</strong> ${order.adminDeliveryRejectReason}</p>`
        : ""
    }

    <div class="seller-actions">
      ${showPickupButton ? `<button class="ready-btn pickup-btn">Mark Picked Up</button>` : ""}
      ${showOutButton ? `<button class="update-status-btn out-btn">Start Delivery</button>` : ""}
    </div>

    ${
      showSignatureBox
        ? `
          <div class="form-card signature-section">
            <h3>Customer Signature</h3>
            <p class="muted">Ask the customer to sign below after receiving the order.</p>

            <canvas
              class="signature-canvas"
              width="600"
              height="220"
              style="border:1px solid #ddd; background:#fff; width:100%; border-radius:12px;">
            </canvas>

            <input class="customer-name" placeholder="Customer full name">

            <textarea class="delivery-note" placeholder="Delivery note optional"></textarea>

            <div class="seller-actions">
              <button class="secondary-btn clear-signature-btn" type="button">Clear Signature</button>
              <button class="submit-delivery-btn" type="button">Submit Delivery</button>
            </div>
          </div>
        `
        : ""
    }
  `;

  deliveryOrdersList.appendChild(card);

  card.querySelector(".pickup-btn")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "orders", order.id), {
      orderStatus: "Picked Up",
      deliveryStatus: "picked_up",
      pickedUpAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadOrders();
  });

  card.querySelector(".out-btn")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "orders", order.id), {
      orderStatus: "Out for Delivery",
      deliveryStatus: "out_for_delivery",
      outForDeliveryAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadOrders();
  });

  if (showSignatureBox) {
    setupSignature(order, card);
  }
}

function setupSignature(order, card) {
  const canvas = card.querySelector(".signature-canvas");

  if (!canvas || typeof SignaturePad === "undefined") {
    card.querySelector(".signature-section").innerHTML = `
      <h3>Signature Error</h3>
      <p>SignaturePad library is missing. Check delivery.html script link.</p>
    `;
    return;
  }

  resizeCanvas(canvas);

  const signaturePad = new SignaturePad(canvas, {
    minWidth: 1,
    maxWidth: 2.5
  });

  card.querySelector(".clear-signature-btn")?.addEventListener("click", () => {
    signaturePad.clear();
  });

  card.querySelector(".submit-delivery-btn")?.addEventListener("click", async () => {
    if (signaturePad.isEmpty()) {
      alert("Customer signature required.");
      return;
    }

    const customerName = card.querySelector(".customer-name").value.trim();

    if (!customerName) {
      alert("Customer full name is required.");
      return;
    }

    const deliveryNote = card.querySelector(".delivery-note").value.trim();

    const submitBtn = card.querySelector(".submit-delivery-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    const signature = signaturePad.toDataURL("image/png");

    await updateDoc(doc(db, "orders", order.id), {
      deliverySignature: signature,
      deliverySignedBy: customerName,
      deliveryNote,
      deliveryGuyId: currentUser.uid,
      deliveryGuyName:
        currentUserData?.name ||
        currentUser.displayName ||
        currentUser.email ||
        "Delivery Driver",
      deliveryStatus: "awaiting_admin_validation",
      orderStatus: "Delivery Submitted",
      deliverySubmittedAt: serverTimestamp(),
      adminDeliveryValidated: false,
      adminDeliveryRejectReason: "",
      updatedAt: serverTimestamp()
    });

    alert("Delivery submitted for admin validation.");

    await loadOrders();
  });
}

function resizeCanvas(canvas) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * ratio;
  canvas.height = 220 * ratio;

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
}

function stepClass(currentStatus, stepStatus) {
  const steps = [
    "Ready for Pickup",
    "Picked Up",
    "Out for Delivery",
    "Delivery Submitted",
    "Delivered"
  ];

  if (currentStatus === "Cancelled" || currentStatus === "Payment Rejected") {
    return "track-step cancelled";
  }

  const currentIndex = steps.indexOf(currentStatus || "Ready for Pickup");
  const stepIndex = steps.indexOf(stepStatus);

  return currentIndex >= stepIndex ? "track-step done" : "track-step";
}
