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
  setDoc,
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
    <div class="order-card">Loading assigned deliveries...</div>
  `;

  try {
    const q = query(
      collection(db, "deliveryJobs"),
      where("driverId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    const jobs = [];

    snapshot.forEach((docSnap) => {
      jobs.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    jobs.sort((a, b) => {
      return (b.updatedAt?.seconds || b.assignedAt?.seconds || 0) -
             (a.updatedAt?.seconds || a.assignedAt?.seconds || 0);
    });

    if (jobs.length === 0) {
      deliveryOrdersList.innerHTML = `
        <div class="order-card">
          <h3>No assigned deliveries</h3>
          <p>Admin has not assigned you any deliveries yet.</p>
        </div>
      `;
      return;
    }

    const activeJobs = jobs.filter(job =>
      job.orderStatus !== "Delivered" &&
      job.orderStatus !== "Cancelled" &&
      job.active !== false
    );

    const completedJobs = jobs.filter(job =>
      job.orderStatus === "Delivered" ||
      job.active === false
    );

    deliveryOrdersList.innerHTML = `
      <section class="form-card">
        <h2>Active Deliveries</h2>
        <div id="activeDeliveries"></div>
      </section>

      <section class="form-card">
        <h2>Completed Deliveries</h2>
        <div id="completedDeliveries"></div>
      </section>
    `;

    const activeDeliveries = document.getElementById("activeDeliveries");
    const completedDeliveries = document.getElementById("completedDeliveries");

    activeDeliveries.innerHTML = activeJobs.length
      ? ""
      : `<p class="muted">No active deliveries.</p>`;

    completedDeliveries.innerHTML = completedJobs.length
      ? ""
      : `<p class="muted">No completed deliveries yet.</p>`;

    activeJobs.forEach(job => renderOrderCard(job, activeDeliveries, false));
    completedJobs.forEach(job => renderOrderCard(job, completedDeliveries, true));
  } catch (error) {
    deliveryOrdersList.innerHTML = `
      <div class="order-card">
        <h3>Could not load deliveries</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function renderOrderCard(order, container, completed) {
  const card = document.createElement("div");
  card.className = "order-card";

  const orderId = order.orderId || order.id;

  const itemsHtml = (order.items || []).map((item) => `
    <li>
      <strong>${item.title || "Item"}</strong>
      — Rs ${Number(item.price || 0)} x ${Number(item.quantity || 1)}
      ${item.shopName ? `— ${item.shopName}` : ""}
    </li>
  `).join("");

  const showPickupButton =
    !completed &&
    (
      order.orderStatus === "Ready for Pickup" ||
      order.deliveryStatus === "assigned"
    );

  const showOutButton =
    !completed &&
    order.orderStatus === "Picked Up";

  const showSignatureBox =
    !completed &&
    (
      order.orderStatus === "Out for Delivery" ||
      order.deliveryStatus === "rejected"
    );

  const signaturePreview = order.deliverySignature
    ? `
      <div class="form-card">
        <h4>Customer Signature</h4>
        <img src="${order.deliverySignature}" alt="Customer signature" style="max-width:100%; background:#fff; border:1px solid #ddd; border-radius:12px;">
        <p><strong>Signed by:</strong> ${order.deliverySignedBy || "Customer"}</p>
        <p><strong>Delivery note:</strong> ${order.deliveryNote || "None"}</p>
      </div>
    `
    : "";

  card.innerHTML = `
    <h3>Order #${String(orderId).slice(0, 8)}</h3>

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
        <p><strong>Total:</strong> Rs ${Number(order.grandTotal || 0)}</p>
        <p><strong>Delivery Fee:</strong> Rs ${Number(order.deliveryFee || 0)}</p>
      </div>
    </div>

    <h4>Items</h4>
    <ul>${itemsHtml || "<li>No items found.</li>"}</ul>

    ${
      order.adminDeliveryRejectReason
        ? `<p class="muted"><strong>Admin reject reason:</strong> ${order.adminDeliveryRejectReason}</p>`
        : ""
    }

    ${signaturePreview}

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

  container.appendChild(card);

  card.querySelector(".pickup-btn")?.addEventListener("click", async () => {
    await updateBoth(orderId, {
      orderStatus: "Picked Up",
      deliveryStatus: "picked_up",
      pickedUpAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadOrders();
  });

  card.querySelector(".out-btn")?.addEventListener("click", async () => {
    await updateBoth(orderId, {
      orderStatus: "Out for Delivery",
      deliveryStatus: "out_for_delivery",
      outForDeliveryAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadOrders();
  });

  if (showSignatureBox) {
    setupSignature(orderId, card);
  }
}

function setupSignature(orderId, card) {
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

    await updateBoth(orderId, {
      deliverySignature: signature,
      deliverySignedBy: customerName,
      deliveryNote,
      deliveryGuyId: currentUser.uid,
      deliveryGuyName:
        currentUserData?.name ||
        currentUser.displayName ||
        currentUser.email ||
        "Delivery Driver",
      driverId: currentUser.uid,
      driverName:
        currentUserData?.name ||
        currentUser.displayName ||
        currentUser.email ||
        "Delivery Driver",
      deliveryStatus: "awaiting_admin_validation",
      orderStatus: "Delivery Submitted",
      deliverySubmittedAt: serverTimestamp(),
      adminDeliveryValidated: false,
      adminDeliveryRejectReason: "",
      active: true,
      updatedAt: serverTimestamp()
    });

    alert("Delivery submitted for admin validation.");
    await loadOrders();
  });
}

async function updateBoth(orderId, data) {
  await updateDoc(doc(db, "orders", orderId), data);
  await setDoc(doc(db, "deliveryJobs", orderId), data, { merge: true });
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
