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
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const deliveryOrdersList = document.getElementById("deliveryOrdersList");
const adminDeliveryMenuBtn = document.getElementById("adminDeliveryMenuBtn");
const adminDeliveryNav = document.getElementById("adminDeliveryNav");

let deliveryDrivers = [];

adminDeliveryMenuBtn?.addEventListener("click", () => {
  adminDeliveryNav?.classList.toggle("show");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (
    !userSnap.exists() ||
    userSnap.data().role !== "admin" ||
    userSnap.data().approved !== true ||
    userSnap.data().blocked === true
  ) {
    window.location.href = "dashboard.html";
    return;
  }

  await loadDeliveryDrivers();
  await loadDeliveryOrders();
});

async function loadDeliveryDrivers() {
  const q = query(
    collection(db, "users"),
    where("role", "==", "delivery")
  );

  const snapshot = await getDocs(q);

  deliveryDrivers = [];

  snapshot.forEach((docSnap) => {
    const user = docSnap.data();

    if (user.approved === true && user.blocked !== true) {
      deliveryDrivers.push({
        id: docSnap.id,
        ...user
      });
    }
  });
}

async function loadDeliveryOrders() {
  deliveryOrdersList.innerHTML = `
    <div class="order-card">
      Loading delivery orders...
    </div>
  `;

  const q = query(
    collection(db, "orders"),
    where("paymentStatus", "==", "verified")
  );

  const snapshot = await getDocs(q);

  const orders = [];

  snapshot.forEach((docSnap) => {
    orders.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  orders.sort((a, b) => {
    return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
  });

  if (orders.length === 0) {
    deliveryOrdersList.innerHTML = `
      <div class="order-card">
        <h3>No verified orders yet</h3>
        <p>Orders will appear here after payment is verified.</p>
      </div>
    `;
    return;
  }

  deliveryOrdersList.innerHTML = "";

  orders.forEach((order) => {
    renderOrderCard(order);
  });
}

function renderOrderCard(order) {
  const itemsHtml = (order.items || []).map(item => `
    <li>
      ${item.title || "Item"} — Rs ${Number(item.price || 0)} x ${Number(item.quantity || 1)}
      ${item.shopName ? `— ${item.shopName}` : ""}
    </li>
  `).join("");

  const driverOptions = deliveryDrivers.map(driver => `
    <option value="${driver.id}" ${order.deliveryGuyId === driver.id ? "selected" : ""}>
      ${driver.name || driver.email || driver.id}
    </option>
  `).join("");

  const signatureBox = order.deliverySignature
    ? `
      <div class="form-card">
        <h4>Customer Signature</h4>
        <img src="${order.deliverySignature}" alt="Customer signature" style="max-width:100%; background:#fff; border:1px solid #ddd; border-radius:12px;">
        <p><strong>Signed by:</strong> ${order.deliverySignedBy || "Customer"}</p>
        <p><strong>Delivery guy:</strong> ${order.deliveryGuyName || "Not specified"}</p>
        <p><strong>Delivery note:</strong> ${order.deliveryNote || "None"}</p>
      </div>
    `
    : `<p class="muted">No customer signature submitted yet.</p>`;

  const assignBox = `
    <div class="delivery-control">
      <label>Assign Delivery Driver</label>
      <select class="driver-select">
        <option value="">Select driver</option>
        ${driverOptions}
      </select>
      <button class="update-status-btn assign-driver-btn">Assign Driver</button>
    </div>
  `;

  const validateButton = order.orderStatus === "Delivery Submitted"
    ? `<button class="approve-btn validate-delivery-btn">Validate Delivery</button>`
    : "";

  const rejectButton = order.orderStatus === "Delivery Submitted"
    ? `<button class="danger-btn reject-delivery-btn">Reject Delivery</button>`
    : "";

  const div = document.createElement("div");
  div.className = "order-card";

  div.innerHTML = `
    <h3>Order #${order.id.slice(0, 8)}</h3>

    <div class="tracking-box">
      <span class="${stepClass(order.orderStatus, "Preparing Order")}">Preparing</span>
      <span class="${stepClass(order.orderStatus, "Ready for Pickup")}">Ready</span>
      <span class="${stepClass(order.orderStatus, "Picked Up")}">Picked Up</span>
      <span class="${stepClass(order.orderStatus, "Out for Delivery")}">Out</span>
      <span class="${stepClass(order.orderStatus, "Delivery Submitted")}">Submitted</span>
      <span class="${stepClass(order.orderStatus, "Delivered")}">Delivered</span>
    </div>

    <div class="order-grid">
      <div>
        <p><strong>Customer:</strong> ${order.customerName || ""}</p>
        <p><strong>Phone:</strong> ${order.customerPhone || ""}</p>
        <p><strong>Address:</strong> ${order.deliveryAddress || ""}</p>
        <p><strong>Notes:</strong> ${order.orderNotes || "None"}</p>
      </div>

      <div>
        <p><strong>Payment:</strong> ${order.paymentStatus || ""}</p>
        <p><strong>Status:</strong> ${order.orderStatus || ""}</p>
        <p><strong>Delivery Status:</strong> ${order.deliveryStatus || "Not started"}</p>
        <p><strong>Assigned Driver:</strong> ${order.deliveryGuyName || "Not assigned"}</p>
        <p><strong>Total:</strong> Rs ${order.grandTotal || 0}</p>
      </div>
    </div>

    <h4>Items</h4>
    <ul>${itemsHtml || "<li>No items found.</li>"}</ul>

    ${assignBox}
    ${signatureBox}

    <div class="seller-actions">
      ${validateButton}
      ${rejectButton}
    </div>
  `;

  div.querySelector(".assign-driver-btn")?.addEventListener("click", async () => {
    const driverId = div.querySelector(".driver-select").value;

    if (!driverId) {
      alert("Please select a delivery driver.");
      return;
    }

    const driver = deliveryDrivers.find(d => d.id === driverId);
    const driverName = driver?.name || driver?.email || "Delivery Driver";

    await updateDoc(doc(db, "orders", order.id), {
      deliveryGuyId: driverId,
      deliveryGuyName: driverName,
      deliveryStatus: "assigned",
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "deliveryJobs", order.id), {
      orderId: order.id,
      driverId,
      driverName,
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      deliveryAddress: order.deliveryAddress || "",
      orderNotes: order.orderNotes || "",
      orderStatus: order.orderStatus || "",
      paymentStatus: order.paymentStatus || "",
      deliveryStatus: "assigned",
      grandTotal: Number(order.grandTotal || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      items: order.items || [],
      active: true,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await loadDeliveryOrders();
  });

  div.querySelector(".validate-delivery-btn")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "orders", order.id), {
      orderStatus: "Delivered",
      deliveryStatus: "validated",
      adminDeliveryValidated: true,
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "deliveryJobs", order.id), {
      orderStatus: "Delivered",
      deliveryStatus: "validated",
      adminDeliveryValidated: true,
      deliveredAt: serverTimestamp(),
      active: false,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await loadDeliveryOrders();
  });

  div.querySelector(".reject-delivery-btn")?.addEventListener("click", async () => {
    const reason = prompt("Why are you rejecting this delivery?");

    await updateDoc(doc(db, "orders", order.id), {
      orderStatus: "Out for Delivery",
      deliveryStatus: "rejected",
      adminDeliveryValidated: false,
      adminDeliveryRejectReason: reason || "",
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "deliveryJobs", order.id), {
      orderStatus: "Out for Delivery",
      deliveryStatus: "rejected",
      adminDeliveryValidated: false,
      adminDeliveryRejectReason: reason || "",
      active: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await loadDeliveryOrders();
  });

  deliveryOrdersList.appendChild(div);
}

function stepClass(currentStatus, stepStatus) {
  const steps = [
    "Preparing Order",
    "Ready for Pickup",
    "Picked Up",
    "Out for Delivery",
    "Delivery Submitted",
    "Delivered"
  ];

  if (currentStatus === "Cancelled" || currentStatus === "Payment Rejected") {
    return "track-step cancelled";
  }

  const currentIndex = steps.indexOf(currentStatus || "Preparing Order");
  const stepIndex = steps.indexOf(stepStatus);

  return currentIndex >= stepIndex ? "track-step done" : "track-step";
}
