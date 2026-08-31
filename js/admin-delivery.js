/**
 * MauMarket Admin Delivery
 * Full product-option compatible version.
 *
 * Supports selected option name/value/unit/display value, product code,
 * SKU, option image, buyer/seller prices and multi-seller pickup routes.
 */
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

/* =========================
   ELEMENTS
========================= */

const deliveryOrdersList = document.getElementById("deliveryOrdersList");

const deliveryTotalCount = document.getElementById("deliveryTotalCount");
const deliveryTodayCount = document.getElementById("deliveryTodayCount");
const deliveryAssignedCount = document.getElementById("deliveryAssignedCount");
const deliveryOutCount = document.getElementById("deliveryOutCount");
const deliveryPendingValidationCount = document.getElementById("deliveryPendingValidationCount");
const deliveryDoneCount = document.getElementById("deliveryDoneCount");

const deliverySearchInput = document.getElementById("deliverySearchInput");
const deliveryStatusFilter = document.getElementById("deliveryStatusFilter");
const deliveryDriverFilter = document.getElementById("deliveryDriverFilter");
const deliveryDateFilter = document.getElementById("deliveryDateFilter");
const deliveryAreaFilter = document.getElementById("deliveryAreaFilter");

const clearDeliveryFiltersBtn = document.getElementById("clearDeliveryFiltersBtn");
const refreshDeliveriesBtn = document.getElementById("refreshDeliveriesBtn");
const printDeliveriesBtn = document.getElementById("printDeliveriesBtn");
const exportDeliveriesBtn = document.getElementById("exportDeliveriesBtn");

const selectedDeliveryOrder = document.getElementById("selectedDeliveryOrder");
const scheduleDriverSelect = document.getElementById("scheduleDriverSelect");
const scheduleDeliveryDate = document.getElementById("scheduleDeliveryDate");
const scheduleTimeSlot = document.getElementById("scheduleTimeSlot");
const schedulePriority = document.getElementById("schedulePriority");
const scheduleNotes = document.getElementById("scheduleNotes");
const saveDeliveryScheduleBtn = document.getElementById("saveDeliveryScheduleBtn");
const printSelectedDeliveryBtn = document.getElementById("printSelectedDeliveryBtn");
const deliveryScheduleMessage = document.getElementById("deliveryScheduleMessage");
const deliveryResultCount = document.getElementById("deliveryResultCount");

/* =========================
   STATE
========================= */

let currentAdmin = null;
let deliveryDrivers = [];
let allOrders = [];
let filteredOrders = [];

/* =========================
   AUTH
========================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentAdmin = user;

  try {
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

    bindEvents();
    await loadPage();
  } catch (error) {
    renderError(error.message);
  }
});

/* =========================
   EVENTS
========================= */

function bindEvents() {
  deliverySearchInput?.addEventListener("input", applyFilters);
  deliveryStatusFilter?.addEventListener("change", applyFilters);
  deliveryDriverFilter?.addEventListener("change", applyFilters);
  deliveryDateFilter?.addEventListener("change", applyFilters);
  deliveryAreaFilter?.addEventListener("input", applyFilters);

  clearDeliveryFiltersBtn?.addEventListener("click", clearFilters);

  refreshDeliveriesBtn?.addEventListener("click", async () => {
    await loadPage();
  });

  printDeliveriesBtn?.addEventListener("click", () => {
    printDeliveryReport(filteredOrders);
  });

  exportDeliveriesBtn?.addEventListener("click", () => {
    exportDeliveriesCSV(filteredOrders);
  });

  saveDeliveryScheduleBtn?.addEventListener("click", saveDeliverySchedule);

  printSelectedDeliveryBtn?.addEventListener("click", () => {
    const orderId = selectedDeliveryOrder?.value;

    if (!orderId) {
      showScheduleMessage("Please select an order first.", "error");
      return;
    }

    const order = allOrders.find((item) => item.id === orderId);

    if (!order) {
      showScheduleMessage("Selected order was not found.", "error");
      return;
    }

    printSingleDelivery(order);
  });
}

/* =========================
   LOAD PAGE
========================= */

async function loadPage() {
  setLoading();

  await loadDeliveryDrivers();
  await loadDeliveryOrders();

  populateDriverSelects();
  populateOrderSelect();

  applyFilters();

  showScheduleMessage("", "");
}

async function loadDeliveryDrivers() {
  const driversQuery = query(
    collection(db, "users"),
    where("role", "==", "delivery")
  );

  const snapshot = await getDocs(driversQuery);

  deliveryDrivers = [];

  snapshot.forEach((docSnap) => {
    const driver = {
      id: docSnap.id,
      ...docSnap.data()
    };

    if (driver.approved === true && driver.blocked !== true) {
      deliveryDrivers.push(driver);
    }
  });

  deliveryDrivers.sort((a, b) => {
    return String(a.name || a.email || "").localeCompare(
      String(b.name || b.email || "")
    );
  });
}

async function loadDeliveryOrders() {
  /*
    The driver writes the signature and "Delivery Submitted" state to
    deliveryJobs first. The secondary /orders sync can legitimately be
    unavailable, so the admin page must merge the latest deliveryJobs data
    into its matching order before rendering validation controls.
  */
  const [ordersSnapshot, jobsSnapshot] = await Promise.all([
    getDocs(
      query(
        collection(db, "orders"),
        where("paymentStatus", "==", "verified")
      )
    ),
    getDocs(collection(db, "deliveryJobs"))
  ]);

  const jobsByOrderId = new Map();

  jobsSnapshot.forEach((jobSnap) => {
    const job = {
      id: jobSnap.id,
      ...jobSnap.data()
    };

    const orderId = job.orderId || jobSnap.id;
    jobsByOrderId.set(orderId, job);
  });

  allOrders = [];

  ordersSnapshot.forEach((orderSnap) => {
    const order = {
      id: orderSnap.id,
      ...orderSnap.data()
    };

    const job = jobsByOrderId.get(orderSnap.id);

    if (job) {
      const deliveryFields = [
        "driverId",
        "driverName",
        "deliveryGuyId",
        "deliveryGuyName",
        "deliveryDate",
        "deliveryDateText",
        "deliveryTimeSlot",
        "deliveryPriority",
        "deliveryNotes",
        "deliveryStatus",
        "orderStatus",
        "pickedUpAt",
        "outForDeliveryAt",
        "deliverySubmittedAt",
        "deliverySignature",
        "deliverySignedBy",
        "deliveryNote",
        "deliveryProofUrl",
        "deliveryProofUrls",
        "deliveryPhotoUrl",
        "adminDeliveryValidated",
        "adminDeliveryRejectReason",
        "active",
        "assignedAt",
        "updatedAt"
      ];

      deliveryFields.forEach((field) => {
        if (job[field] !== undefined) {
          order[field] = job[field];
        }
      });

      order._deliveryJobId = job.id;
    }

    allOrders.push(order);
  });

  allOrders.sort((a, b) => {
    const aTime =
      a.deliveryDateText ||
      a.deliveryDate ||
      a.updatedAt?.seconds ||
      a.createdAt?.seconds ||
      0;

    const bTime =
      b.deliveryDateText ||
      b.deliveryDate ||
      b.updatedAt?.seconds ||
      b.createdAt?.seconds ||
      0;

    if (typeof aTime === "string" && typeof bTime === "string") {
      return bTime.localeCompare(aTime);
    }

    return Number(bTime) - Number(aTime);
  });
}

/* =========================
   POPULATE SELECTS
========================= */

function populateDriverSelects() {
  const driverOptions = deliveryDrivers.map((driver) => {
    const name = driver.name || driver.fullName || driver.email || driver.id;

    return `
      <option value="${escapeHtml(driver.id)}">
        ${escapeHtml(name)}
      </option>
    `;
  }).join("");

  if (deliveryDriverFilter) {
    deliveryDriverFilter.innerHTML = `
      <option value="">All Drivers</option>
      ${driverOptions}
    `;
  }

  if (scheduleDriverSelect) {
    scheduleDriverSelect.innerHTML = `
      <option value="">Select driver</option>
      ${driverOptions}
    `;
  }
}

function populateOrderSelect() {
  if (!selectedDeliveryOrder) return;

  selectedDeliveryOrder.innerHTML = `
    <option value="">Select an order</option>
  `;

  allOrders.forEach((order) => {
    const option = document.createElement("option");

    option.value = order.id;
    option.textContent = `#${order.id.slice(0, 8)} — ${order.customerName || "Customer"} — Rs ${formatMoney(order.grandTotal || 0)}`;

    selectedDeliveryOrder.appendChild(option);
  });
}

/* =========================
   FILTERS
========================= */

function applyFilters() {
  const search = normalize(deliverySearchInput?.value || "");
  const status = deliveryStatusFilter?.value || "";
  const driverId = deliveryDriverFilter?.value || "";
  const deliveryDate = deliveryDateFilter?.value || "";
  const area = normalize(deliveryAreaFilter?.value || "");

  filteredOrders = allOrders.filter((order) => {
    const orderStatus = order.orderStatus || "";
    const orderDriverId = order.deliveryGuyId || order.driverId || "";
    const orderDate = getOrderDeliveryDate(order);
    const orderArea = normalize(order.deliveryAddress || order.customerAddress || "");

    const searchableText = normalize(`
      ${order.id}
      ${order.customerName || ""}
      ${order.customerPhone || ""}
      ${order.deliveryAddress || ""}
      ${order.orderNotes || ""}
      ${order.deliveryGuyName || ""}
      ${order.orderStatus || ""}
      ${order.deliveryStatus || ""}
      ${(order.items || []).map((item) => itemSearchText(item)).join(" ")}
      ${(order.pickupStops || []).map((stop) => `
        ${stop.shopName || ""}
        ${stop.pickupAddress || ""}
        ${stop.shopLocation || ""}
        ${stop.shopAddress || ""}
        ${(stop.items || []).map((item) => itemSearchText(item)).join(" ")}
      `).join(" ")}
    `);

    const matchesSearch = !search || searchableText.includes(search);
    const matchesStatus = !status || orderStatus === status;
    const matchesDriver = !driverId || orderDriverId === driverId;
    const matchesDate = !deliveryDate || orderDate === deliveryDate;
    const matchesArea = !area || orderArea.includes(area);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesDriver &&
      matchesDate &&
      matchesArea
    );
  });

  updateStats();
  renderOrders(filteredOrders);
}

function clearFilters() {
  if (deliverySearchInput) deliverySearchInput.value = "";
  if (deliveryStatusFilter) deliveryStatusFilter.value = "";
  if (deliveryDriverFilter) deliveryDriverFilter.value = "";
  if (deliveryDateFilter) deliveryDateFilter.value = "";
  if (deliveryAreaFilter) deliveryAreaFilter.value = "";

  applyFilters();
}

/* =========================
   STATS
========================= */

function updateStats() {
  const today = getTodayDate();

  const total = allOrders.length;

  const todayCount = allOrders.filter((order) => {
    return getOrderDeliveryDate(order) === today;
  }).length;

  const assigned = allOrders.filter((order) => {
    return Boolean(order.deliveryGuyId || order.driverId);
  }).length;

  const out = allOrders.filter((order) => {
    return order.orderStatus === "Out for Delivery";
  }).length;

  const pendingValidation = allOrders.filter((order) => {
    return (
      order.orderStatus === "Delivery Submitted" ||
      order.deliveryStatus === "awaiting_admin_validation"
    );
  }).length;

  const delivered = allOrders.filter((order) => {
    return order.orderStatus === "Delivered";
  }).length;

  if (deliveryTotalCount) deliveryTotalCount.textContent = total;
  if (deliveryTodayCount) deliveryTodayCount.textContent = todayCount;
  if (deliveryAssignedCount) deliveryAssignedCount.textContent = assigned;
  if (deliveryOutCount) deliveryOutCount.textContent = out;
  if (deliveryPendingValidationCount) {
    deliveryPendingValidationCount.textContent = pendingValidation;
  }
  if (deliveryDoneCount) deliveryDoneCount.textContent = delivered;

  if (deliveryResultCount) {
    deliveryResultCount.textContent = `${filteredOrders.length} delivery order(s) found`;
  }
}

/* =========================
   RENDER ORDERS
========================= */

function renderOrders(orders) {
  if (!deliveryOrdersList) return;

  deliveryOrdersList.setAttribute("aria-busy", "false");

  if (orders.length === 0) {
    deliveryOrdersList.innerHTML = `
      <div class="delivery-empty-state">
        <h3>No delivery orders found</h3>
        <p>Try changing the filters or refresh the delivery list.</p>
      </div>
    `;
    return;
  }

  deliveryOrdersList.innerHTML = orders.map((order) => {
    return orderCardHtml(order);
  }).join("");

  deliveryOrdersList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleOrderAction);
  });

  deliveryOrdersList.querySelectorAll(".delivery-row-select").forEach((button) => {
    button.addEventListener("click", () => {
      const orderId = button.dataset.orderId;

      if (selectedDeliveryOrder) {
        selectedDeliveryOrder.value = orderId;
      }

      const order = allOrders.find((item) => item.id === orderId);

      if (order) {
        fillScheduler(order);
        scrollToScheduler();
      }
    });
  });
}

function orderCardHtml(order) {
  const status = order.orderStatus || "Preparing Order";
  const deliveryStatus = order.deliveryStatus || "Not started";
  const driverName = order.deliveryGuyName || "Not assigned";
  const driverId = order.deliveryGuyId || "";
  const deliveryDate = getOrderDeliveryDate(order) || "Not scheduled";
  const timeSlot = order.deliveryTimeSlot || "No time slot";
  const priority = order.deliveryPriority || "Normal";
  const total = Number(order.grandTotal || 0);
  const deliveryFee = Number(order.deliveryFee || 0);

  const itemsCount = (order.items || []).reduce((sum, item) => {
    return sum + Number(item.quantity || 1);
  }, 0);

  const statusClass = getStatusClass(status);
  const priorityClass = getPriorityClass(priority);
  const mapUrl = getMapUrl(order);
  const hasPin = hasCoordinates(order);
  const pickupStops = normalizePickupStops(order);
  const pickupStopsHtml = renderPickupStopsHtml(pickupStops);
  const pickupCountText = pickupStops.length > 1
    ? `${pickupStops.length} pickup locations`
    : pickupStops.length === 1
      ? "1 pickup location"
      : "No pickup location";

  return `
    <article class="delivery-order-card" data-order-id="${escapeHtml(order.id)}">

      <div class="delivery-order-top">
        <div>
          <span class="delivery-order-id">Order #${escapeHtml(order.id.slice(0, 8))}</span>
          <h3>${escapeHtml(order.customerName || "Customer")}</h3>
          <p>${escapeHtml(order.deliveryAddress || "No delivery address")}</p>
        </div>

        <div class="delivery-badges">
          <span class="delivery-status ${statusClass}">
            ${escapeHtml(status)}
          </span>

          <span class="delivery-priority ${priorityClass}">
            ${escapeHtml(priority)}
          </span>
        </div>
      </div>

      <div class="delivery-progress">
        ${timelineStep(status, "Preparing Order", "Preparing")}
        ${timelineStep(status, "Ready for Pickup", "Ready")}
        ${timelineStep(status, "Picked Up", "Picked Up")}
        ${timelineStep(status, "Out for Delivery", "Out")}
        ${timelineStep(status, "Delivery Submitted", "Submitted")}
        ${timelineStep(status, "Delivered", "Delivered")}
      </div>

      <div class="delivery-order-grid">
        <div class="delivery-info-box">
          <small>Customer</small>
          <strong>${escapeHtml(order.customerName || "Customer")}</strong>
          <span>${escapeHtml(order.customerPhone || "No phone")}</span>
        </div>

        <div class="delivery-info-box pickup-location-summary">
          <small>Pickup Route</small>
          <strong>${escapeHtml(pickupCountText)}</strong>
          <span>${escapeHtml(pickupStops.map((stop) => stop.shopName).filter(Boolean).slice(0, 2).join(" → ") || "Pickup details not set")}</span>
        </div>

        <div class="delivery-info-box pinned-location-box">
          <small>Pinned Location</small>
          <strong>${hasPin ? "Exact pin available" : "Address only"}</strong>
          <span>${hasPin ? `${Number(getLatitude(order)).toFixed(6)}, ${Number(getLongitude(order)).toFixed(6)}` : escapeHtml(shortText(order.deliveryAddress || "No pin", 36))}</span>
        </div>

        <div class="delivery-info-box">
          <small>Driver</small>
          <strong>${escapeHtml(driverName)}</strong>
          <span>${escapeHtml(deliveryStatus)}</span>
        </div>

        <div class="delivery-info-box">
          <small>Schedule</small>
          <strong>${escapeHtml(deliveryDate)}</strong>
          <span>${escapeHtml(timeSlot)}</span>
        </div>

        <div class="delivery-info-box">
          <small>Package</small>
          <strong>${itemsCount} item(s)</strong>
          <span>Fee: Rs ${formatMoney(deliveryFee)}</span>
        </div>

        <div class="delivery-info-box">
          <small>Total</small>
          <strong>Rs ${formatMoney(total)}</strong>
          <span>${escapeHtml(order.paymentStatus || "Payment")}</span>
        </div>
      </div>

      <details class="delivery-details">
        <summary>View order details</summary>

        <div class="delivery-detail-body">
          <div>
            <h4>Pickup Locations</h4>
            ${pickupStopsHtml}

            <h4>Items and Selected Options</h4>
            <div class="delivery-items-list">
              ${
                (order.items || []).map((item) => deliveryItemHtml(item)).join("") ||
                `<p class="muted">No items found.</p>`
              }
            </div>
          </div>

          <div>
            <h4>Delivery Notes</h4>
            <p>${escapeHtml(order.orderNotes || order.deliveryNotes || "No notes.")}</p>

            ${
              mapUrl
                ? `
                  <div class="delivery-map-box">
                    <h4>Customer Pin Location</h4>
                    <p>${hasPin ? `${Number(getLatitude(order)).toFixed(6)}, ${Number(getLongitude(order)).toFixed(6)}` : escapeHtml(order.deliveryAddress || "No address")}</p>
                    <a class="secondary-btn map-btn" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">
                      Open in Google Maps
                    </a>
                  </div>
                `
                : ""
            }

            ${
              order.deliverySignature
                ? `
                  <div class="delivery-signature-box">
                    <h4>Customer Signature</h4>
                    <img src="${escapeHtml(order.deliverySignature)}" alt="Customer signature">
                    <p><strong>Signed by:</strong> ${escapeHtml(order.deliverySignedBy || "Customer")}</p>
                    <p><strong>Driver:</strong> ${escapeHtml(order.deliveryGuyName || "Driver")}</p>
                    <p><strong>Note:</strong> ${escapeHtml(order.deliveryNote || "None")}</p>
                  </div>
                `
                : `<p class="muted">No customer signature submitted yet.</p>`
            }
          </div>
        </div>
      </details>

      <div class="delivery-card-actions">
        <button
          type="button"
          class="secondary-btn delivery-row-select"
          data-order-id="${escapeHtml(order.id)}">
          Schedule
        </button>

        <button
          type="button"
          class="secondary-btn"
          data-action="print"
          data-order-id="${escapeHtml(order.id)}">
          Print
        </button>

        ${
          mapUrl
            ? `
              <a
                class="secondary-btn map-btn"
                href="${escapeHtml(mapUrl)}"
                target="_blank"
                rel="noopener">
                Open Map
              </a>
            `
            : ""
        }

        ${
          (
            status === "Delivery Submitted" ||
            deliveryStatus === "awaiting_admin_validation"
          )
            ? `
              <button
                type="button"
                class="approve-btn"
                data-action="validate"
                data-order-id="${escapeHtml(order.id)}">
                Validate
              </button>

              <button
                type="button"
                class="danger-btn"
                data-action="reject"
                data-order-id="${escapeHtml(order.id)}">
                Reject
              </button>
            `
            : ""
        }

        ${
          driverId && status !== "Delivered"
            ? `
              <button
                type="button"
                class="secondary-btn"
                data-action="out"
                data-order-id="${escapeHtml(order.id)}">
                Mark Out
              </button>
            `
            : ""
        }
      </div>

    </article>
  `;
}

/* =========================
   ORDER ACTIONS
========================= */

async function handleOrderAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  const orderId = button.dataset.orderId;

  const order = allOrders.find((item) => item.id === orderId);

  if (!order) {
    alert("Order not found.");
    return;
  }

  if (action === "print") {
    printSingleDelivery(order);
    return;
  }

  if (action === "validate") {
    await validateDelivery(order);
    return;
  }

  if (action === "reject") {
    await rejectDelivery(order);
    return;
  }

  if (action === "out") {
    await markOutForDelivery(order);
    return;
  }
}

async function saveDeliverySchedule() {
  const orderId = selectedDeliveryOrder?.value || "";
  const driverId = scheduleDriverSelect?.value || "";
  const date = scheduleDeliveryDate?.value || "";
  const timeSlot = scheduleTimeSlot?.value || "";
  const priority = schedulePriority?.value || "Normal";
  const notes = scheduleNotes?.value || "";

  if (!orderId) {
    showScheduleMessage("Please select an order.", "error");
    return;
  }

  if (!driverId) {
    showScheduleMessage("Please select a delivery driver.", "error");
    return;
  }

  if (!date) {
    showScheduleMessage("Please choose a delivery date.", "error");
    return;
  }

  if (!timeSlot) {
    showScheduleMessage("Please choose a time slot.", "error");
    return;
  }

  const order = allOrders.find((item) => item.id === orderId);

  if (!order) {
    showScheduleMessage("Order not found.", "error");
    return;
  }

  const driver = deliveryDrivers.find((item) => item.id === driverId);
  const driverName = driver?.name || driver?.fullName || driver?.email || "Delivery Driver";

  try {
    await updateDoc(doc(db, "orders", orderId), {
      deliveryGuyId: driverId,
      deliveryGuyName: driverName,
      driverId,
      driverName,
      deliveryDate: date,
      deliveryDateText: date,
      deliveryTimeSlot: timeSlot,
      deliveryPriority: priority,
      deliveryNotes: notes,
      deliveryStatus: "assigned",
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "deliveryJobs", orderId), {
      orderId,
      driverId,
      driverName,
      customerName: order.customerName || "",
      customerPhone: order.customerPhone || "",
      deliveryAddress: order.deliveryAddress || "",
      deliveryLatitude: getLatitude(order) || null,
      deliveryLongitude: getLongitude(order) || null,
      deliveryLocation: hasCoordinates(order)
        ? {
            lat: getLatitude(order),
            lng: getLongitude(order)
          }
        : null,
      orderNotes: order.orderNotes || "",
      deliveryNotes: notes,
      deliveryDate: date,
      deliveryDateText: date,
      deliveryTimeSlot: timeSlot,
      deliveryPriority: priority,
      orderStatus: order.orderStatus || "",
      paymentStatus: order.paymentStatus || "",
      deliveryStatus: "assigned",
      grandTotal: Number(order.grandTotal || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      items: (order.items || []).map((item) => normalizeDeliveryItem(item)),
      pickupStops: normalizePickupStops(order),
      pickupCount: normalizePickupStops(order).length,
      hasMultiplePickupLocations: normalizePickupStops(order).length > 1,
      active: true,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    showScheduleMessage("Delivery assignment saved successfully.", "success");

    await loadPage();
  } catch (error) {
    showScheduleMessage(error.message, "error");
  }
}

async function validateDelivery(order) {
  if (!confirm("Approve this submitted delivery and mark it as Delivered?")) {
    return;
  }

  const jobId = order._deliveryJobId || order.id;

  try {
    const orderUpdate = {
      orderStatus: "Delivered",
      deliveryStatus: "validated",
      adminDeliveryValidated: true,
      adminDeliveryRejectReason: "",
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Keep the signed proof permanently on the main order as well.
    if (order.deliverySignature) {
      orderUpdate.deliverySignature = order.deliverySignature;
    }

    if (order.deliverySignedBy) {
      orderUpdate.deliverySignedBy = order.deliverySignedBy;
    }

    if (order.deliveryNote !== undefined) {
      orderUpdate.deliveryNote = order.deliveryNote || "";
    }

    if (order.deliverySubmittedAt) {
      orderUpdate.deliverySubmittedAt = order.deliverySubmittedAt;
    }

    if (order.deliveryGuyName) {
      orderUpdate.deliveryGuyName = order.deliveryGuyName;
    }

    if (order.driverName) {
      orderUpdate.driverName = order.driverName;
    }

    await updateDoc(doc(db, "orders", order.id), orderUpdate);

    await setDoc(doc(db, "deliveryJobs", jobId), {
      orderStatus: "Delivered",
      deliveryStatus: "validated",
      adminDeliveryValidated: true,
      adminDeliveryRejectReason: "",
      deliveredAt: serverTimestamp(),
      active: false,
      updatedAt: serverTimestamp()
    }, { merge: true });

    alert("Delivery approved and marked as Delivered.");
    await loadPage();
  } catch (error) {
    console.error("Unable to validate delivery:", error);
    alert(error?.message || "Unable to validate delivery.");
  }
}

async function rejectDelivery(order) {
  const reason = prompt("Why are you rejecting this delivery?");

  if (reason === null) return;

  const cleanReason = String(reason || "").trim();

  if (!cleanReason) {
    alert("Please enter a rejection reason.");
    return;
  }

  const jobId = order._deliveryJobId || order.id;

  try {
    await updateDoc(doc(db, "orders", order.id), {
      orderStatus: "Out for Delivery",
      deliveryStatus: "rejected",
      adminDeliveryValidated: false,
      adminDeliveryRejectReason: cleanReason,
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "deliveryJobs", jobId), {
      orderStatus: "Out for Delivery",
      deliveryStatus: "rejected",
      adminDeliveryValidated: false,
      adminDeliveryRejectReason: cleanReason,
      active: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    alert("Delivery rejected and returned to the driver.");
    await loadPage();
  } catch (error) {
    console.error("Unable to reject delivery:", error);
    alert(error?.message || "Unable to reject delivery.");
  }
}

async function markOutForDelivery(order) {
  if (!confirm("Mark this order as Out for Delivery?")) return;

  const jobId = order._deliveryJobId || order.id;

  await updateDoc(doc(db, "orders", order.id), {
    orderStatus: "Out for Delivery",
    deliveryStatus: "out_for_delivery",
    outForDeliveryAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, "deliveryJobs", jobId), {
    orderStatus: "Out for Delivery",
    deliveryStatus: "out_for_delivery",
    outForDeliveryAt: serverTimestamp(),
    active: true,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await loadPage();
}

/* =========================
   SCHEDULER
========================= */

function fillScheduler(order) {
  const driverId = order.deliveryGuyId || "";
  const deliveryDate = getOrderDeliveryDate(order);
  const timeSlot = order.deliveryTimeSlot || "";
  const priority = order.deliveryPriority || "Normal";
  const notes = order.deliveryNotes || order.orderNotes || "";

  if (selectedDeliveryOrder) selectedDeliveryOrder.value = order.id;
  if (scheduleDriverSelect) scheduleDriverSelect.value = driverId;
  if (scheduleDeliveryDate) scheduleDeliveryDate.value = deliveryDate || "";
  if (scheduleTimeSlot) scheduleTimeSlot.value = timeSlot;
  if (schedulePriority) schedulePriority.value = priority;
  if (scheduleNotes) scheduleNotes.value = notes;

  showScheduleMessage(`Selected order #${order.id.slice(0, 8)}.`, "success");
}

function scrollToScheduler() {
  document.querySelector(".delivery-scheduler-card")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function showScheduleMessage(message, type) {
  if (!deliveryScheduleMessage) return;

  deliveryScheduleMessage.textContent = message || "";
  deliveryScheduleMessage.className = type ? `delivery-message ${type}` : "";
}

/* =========================
   EXPORT / PRINT
========================= */

function exportDeliveriesCSV(orders) {
  if (!orders.length) {
    alert("No deliveries to export.");
    return;
  }

  const rows = [
    [
      "Order ID",
      "Customer",
      "Phone",
      "Address",
      "Pickup Locations",
      "Pickup Addresses",
      "Latitude",
      "Longitude",
      "Driver",
      "Delivery Date",
      "Time Slot",
      "Priority",
      "Order Status",
      "Delivery Status",
      "Items",
      "Selected Options",
      "Product Codes",
      "Total"
    ]
  ];

  orders.forEach((order) => {
    rows.push([
      order.id,
      order.customerName || "",
      order.customerPhone || "",
      order.deliveryAddress || "",
      normalizePickupStops(order).map((stop) => stop.shopName || "").join(" | "),
      normalizePickupStops(order).map((stop) => stop.pickupAddress || stop.shopAddress || stop.shopLocation || "").join(" | "),
      getLatitude(order) || "",
      getLongitude(order) || "",
      order.deliveryGuyName || "",
      getOrderDeliveryDate(order) || "",
      order.deliveryTimeSlot || "",
      order.deliveryPriority || "",
      order.orderStatus || "",
      order.deliveryStatus || "",
      (order.items || []).map((item) => {
        const normalizedItem = normalizeDeliveryItem(item);
        return `${normalizedItem.title} x ${normalizedItem.quantity}`;
      }).join(" | "),
      (order.items || []).map((item) => getItemOptionDisplay(item)).filter(Boolean).join(" | "),
      (order.items || []).map((item) => normalizeDeliveryItem(item).productCode).filter(Boolean).join(" | "),
      Number(order.grandTotal || 0)
    ]);
  });

  const csv = rows.map((row) => {
    return row.map((cell) => {
      return `"${String(cell).replaceAll('"', '""')}"`;
    }).join(",");
  }).join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `maumarket-deliveries-${getTodayDate()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

function printDeliveryReport(orders) {
  if (!orders.length) {
    alert("No deliveries to print.");
    return;
  }

  const html = `
    ${printStyles()}
    <main class="print-page">
      <header class="print-header">
        <h1>MauMarket Delivery Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </header>

      <table class="print-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Driver</th>
            <th>Date</th>
            <th>Status</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          ${orders.map((order) => `
            <tr>
              <td>#${escapeHtml(order.id.slice(0, 8))}</td>
              <td>${escapeHtml(order.customerName || "Customer")}</td>
              <td>${escapeHtml(order.deliveryGuyName || "Not assigned")}</td>
              <td>${escapeHtml(getOrderDeliveryDate(order) || "Not scheduled")}</td>
              <td>${escapeHtml(order.orderStatus || "")}</td>
              <td>Rs ${formatMoney(order.grandTotal || 0)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </main>
  `;

  openPrintWindow(html);
}

function printSingleDelivery(order) {
  const mapUrl = getMapUrl(order);
  const pickupStops = normalizePickupStops(order);

  const pickupRows = pickupStops.map((stop, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(stop.shopName || "Shop")}</td>
      <td>${escapeHtml(stop.pickupAddress || stop.shopAddress || stop.shopLocation || "Pickup location not set")}</td>
      <td>${escapeHtml((stop.items || []).map((item) => {
        const normalizedItem = normalizeDeliveryItem(item);
        const optionDisplay = getItemOptionDisplay(normalizedItem);
        const codeText = normalizedItem.productCode ? ` [${normalizedItem.productCode}]` : "";
        return `${normalizedItem.title}${optionDisplay ? ` (${optionDisplay})` : ""}${codeText} x ${normalizedItem.quantity}`;
      }).join(", "))}</td>
    </tr>
  `).join("");

  const items = (order.items || []).map((item) => {
    const normalizedItem = normalizeDeliveryItem(item);
    const optionDisplay = getItemOptionDisplay(normalizedItem);

    return `
      <tr>
        <td>
          <strong>${escapeHtml(normalizedItem.title)}</strong>
          ${optionDisplay ? `<br><small>${escapeHtml(optionDisplay)}</small>` : ""}
          ${normalizedItem.productCode ? `<br><small>Product code: ${escapeHtml(normalizedItem.productCode)}</small>` : ""}
          ${normalizedItem.sku ? `<br><small>SKU: ${escapeHtml(normalizedItem.sku)}</small>` : ""}
          ${normalizedItem.shopName ? `<br><small>Seller: ${escapeHtml(normalizedItem.shopName)}</small>` : ""}
        </td>
        <td>${normalizedItem.quantity}</td>
        <td>Rs ${formatMoney(normalizedItem.price)}</td>
        <td>Rs ${formatMoney(normalizedItem.subtotal)}</td>
      </tr>
    `;
  }).join("");

  const html = `
    ${printStyles()}
    <main class="print-page">
      <header class="print-header">
        <h1>MauMarket Delivery Note</h1>
        <p>Order #${escapeHtml(order.id)}</p>
      </header>

      <section class="print-grid">
        <div>
          <h3>Customer</h3>
          <p><strong>Name:</strong> ${escapeHtml(order.customerName || "")}</p>
          <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone || "")}</p>
          <p><strong>Address:</strong> ${escapeHtml(order.deliveryAddress || "")}</p>
          ${
            hasCoordinates(order)
              ? `<p><strong>Pin:</strong> ${Number(getLatitude(order)).toFixed(6)}, ${Number(getLongitude(order)).toFixed(6)}</p>`
              : ""
          }
          ${
            mapUrl
              ? `<p><strong>Map:</strong> ${escapeHtml(mapUrl)}</p>`
              : ""
          }
        </div>

        <div>
          <h3>Delivery</h3>
          <p><strong>Driver:</strong> ${escapeHtml(order.deliveryGuyName || "Not assigned")}</p>
          <p><strong>Date:</strong> ${escapeHtml(getOrderDeliveryDate(order) || "Not scheduled")}</p>
          <p><strong>Time Slot:</strong> ${escapeHtml(order.deliveryTimeSlot || "Not set")}</p>
          <p><strong>Priority:</strong> ${escapeHtml(order.deliveryPriority || "Normal")}</p>
        </div>
      </section>

      <h3>Pickup Locations</h3>

      <table class="print-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Shop</th>
            <th>Pickup Address</th>
            <th>Items to Collect</th>
          </tr>
        </thead>

        <tbody>
          ${pickupRows || `
            <tr>
              <td colspan="4">No pickup locations found.</td>
            </tr>
          `}
        </tbody>
      </table>

      <h3>Items</h3>

      <table class="print-table">
        <thead>
          <tr>
            <th>Item / Selected Option</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          ${items || `
            <tr>
              <td colspan="4">No items found.</td>
            </tr>
          `}
        </tbody>
      </table>

      <section class="print-total">
        <p><strong>Delivery Fee:</strong> Rs ${formatMoney(order.deliveryFee || 0)}</p>
        <h2>Total: Rs ${formatMoney(order.grandTotal || 0)}</h2>
      </section>

      <section class="print-signature">
        <div>
          <p>Customer Signature</p>
        </div>

        <div>
          <p>Driver Signature</p>
        </div>
      </section>
    </main>
  `;

  openPrintWindow(html);
}

function openPrintWindow(html) {
  const win = window.open("", "_blank", "width=1000,height=800");

  win.document.open();
  win.document.write(html);
  win.document.close();

  win.onload = () => {
    win.focus();
    win.print();
  };
}

function printStyles() {
  return `
    <style>
      body {
        margin: 0;
        padding: 30px;
        font-family: Arial, sans-serif;
        color: #111827;
      }

      .print-page {
        max-width: 1000px;
        margin: auto;
      }

      .print-header {
        border-bottom: 3px solid #4f35f5;
        margin-bottom: 25px;
        padding-bottom: 15px;
      }

      .print-header h1 {
        margin: 0;
        color: #4f35f5;
      }

      .print-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 25px;
        margin-bottom: 25px;
      }

      .print-grid div {
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
      }

      .print-table {
        width: 100%;
        border-collapse: collapse;
      }

      .print-table th,
      .print-table td {
        border: 1px solid #e5e7eb;
        padding: 10px;
        text-align: left;
      }

      .print-table th {
        background: #f3f4f6;
      }

      .print-total {
        margin-top: 25px;
        text-align: right;
      }

      h3 {
        margin-top: 26px;
      }

      .print-signature {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 35px;
        margin-top: 70px;
      }

      .print-signature div {
        border-top: 2px solid #111827;
        padding-top: 10px;
      }
    </style>
  `;
}

/* =========================
   HELPERS
========================= */


/* =========================
   PICKUP HELPERS
========================= */

function normalizePickupStops(order) {
  if (Array.isArray(order.pickupStops) && order.pickupStops.length > 0) {
    return order.pickupStops.map((stop) => normalizePickupStop(stop));
  }

  if (Array.isArray(order.sellerBreakdown) && order.sellerBreakdown.length > 0) {
    return order.sellerBreakdown.map((seller) => normalizePickupStop(seller));
  }

  const grouped = {};

  (order.items || []).forEach((item) => {
    const sellerId = item.sellerId || "unknown";

    if (!grouped[sellerId]) {
      grouped[sellerId] = {
        sellerId,
        shopName: item.shopName || "Unknown Shop",
        shopLocation: item.shopLocation || "",
        shopAddress: item.shopAddress || "",
        pickupAddress: item.pickupAddress || item.shopAddress || item.shopLocation || "",
        pickupLatitude: item.pickupLatitude ?? null,
        pickupLongitude: item.pickupLongitude ?? null,
        pickupLocation: item.pickupLocation || null,
        itemCount: 0,
        itemsTotal: 0,
        items: []
      };
    }

    grouped[sellerId].itemCount += Number(item.quantity || 1);
    grouped[sellerId].itemsTotal += Number(item.subtotal || 0);

    const normalizedItem = normalizeDeliveryItem(item);

    grouped[sellerId].items.push({
      productId: normalizedItem.productId,
      title: normalizedItem.title,
      quantity: normalizedItem.quantity,
      price: normalizedItem.price,
      buyerPrice: normalizedItem.buyerPrice,
      sellerPrice: normalizedItem.sellerPrice,
      subtotal: normalizedItem.subtotal,
      image: normalizedItem.image,
      optionImage: normalizedItem.optionImage,
      selectedOptionName: normalizedItem.selectedOptionName,
      selectedOptionValue: normalizedItem.selectedOptionValue,
      selectedOptionUnit: normalizedItem.selectedOptionUnit,
      selectedOptionDisplayValue: normalizedItem.selectedOptionDisplayValue,
      measurementValue: normalizedItem.measurementValue,
      measurementUnit: normalizedItem.measurementUnit,
      sizeValue: normalizedItem.sizeValue,
      sizeUnit: normalizedItem.sizeUnit,
      sku: normalizedItem.sku,
      productCode: normalizedItem.productCode,
      shopName: normalizedItem.shopName,
      sellerId: normalizedItem.sellerId
    });
  });

  return Object.values(grouped).map((stop) => normalizePickupStop(stop));
}

function normalizePickupStop(stop) {
  const lat = Number(stop.pickupLatitude || stop.pickupLocation?.lat || stop.latitude || 0);
  const lng = Number(stop.pickupLongitude || stop.pickupLocation?.lng || stop.longitude || 0);

  return {
    sellerId: stop.sellerId || "unknown",
    shopName: stop.shopName || stop.name || "Unknown Shop",
    shopLocation: stop.shopLocation || stop.location || "",
    shopAddress: stop.shopAddress || stop.address || "",
    pickupAddress: stop.pickupAddress || stop.shopAddress || stop.shopLocation || stop.address || stop.location || "",
    pickupLatitude: lat || null,
    pickupLongitude: lng || null,
    pickupLocation: lat && lng ? { lat, lng } : null,
    itemCount: Number(stop.itemCount || 0),
    itemsTotal: Number(stop.itemsTotal || 0),
    items: Array.isArray(stop.items) ? stop.items : []
  };
}

function renderPickupStopsHtml(pickupStops) {
  if (!pickupStops.length) {
    return `
      <div class="pickup-stops-box">
        <p class="muted">No pickup location saved for this order.</p>
      </div>
    `;
  }

  return `
    <div class="pickup-stops-box">
      ${pickupStops.map((stop, index) => {
        const mapUrl = getPickupMapUrl(stop);
        const itemList = (stop.items || []).map((item) => {
          const normalizedItem = normalizeDeliveryItem(item);
          const optionDisplay = getItemOptionDisplay(normalizedItem);

          return `
            <li>
              <strong>${escapeHtml(normalizedItem.title)}</strong>
              ${optionDisplay ? `<span> — ${escapeHtml(optionDisplay)}</span>` : ""}
              ${normalizedItem.productCode ? `<span> — Code: ${escapeHtml(normalizedItem.productCode)}</span>` : ""}
              × ${normalizedItem.quantity}
            </li>
          `;
        }).join("");

        return `
          <div class="pickup-stop-card">
            <div class="pickup-stop-head">
              <span>Pickup ${index + 1}</span>
              <strong>${escapeHtml(stop.shopName || "Shop")}</strong>
            </div>

            <p>
              <strong>Address:</strong>
              ${escapeHtml(stop.pickupAddress || stop.shopAddress || stop.shopLocation || "Pickup location not set")}
            </p>

            ${
              stop.pickupLatitude && stop.pickupLongitude
                ? `<p><strong>Pin:</strong> ${Number(stop.pickupLatitude).toFixed(6)}, ${Number(stop.pickupLongitude).toFixed(6)}</p>`
                : ""
            }

            <ul>${itemList || "<li>No items listed for this pickup.</li>"}</ul>

            ${
              mapUrl
                ? `<a class="secondary-btn map-btn" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">Open Pickup Map</a>`
                : ""
            }
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getPickupMapUrl(stop) {
  if (stop.pickupLatitude && stop.pickupLongitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stop.pickupLatitude},${stop.pickupLongitude}`)}`;
  }

  const address = stop.pickupAddress || stop.shopAddress || stop.shopLocation || "";

  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  return "";
}

function normalizeDeliveryItem(item = {}) {
  const selectedOption = item.selectedOption && typeof item.selectedOption === "object"
    ? item.selectedOption
    : {};

  const optionValue =
    item.selectedOptionValue ??
    selectedOption.value ??
    item.optionValue ??
    item.variantValue ??
    item.measurementValue ??
    item.sizeValue ??
    "";

  const optionUnit =
    item.selectedOptionUnit ??
    selectedOption.unit ??
    item.optionUnit ??
    item.variantUnit ??
    item.measurementUnit ??
    item.sizeUnit ??
    "";

  const optionName =
    item.selectedOptionName ??
    selectedOption.name ??
    item.optionName ??
    item.variantName ??
    "";

  const displayValue =
    item.selectedOptionDisplayValue ??
    selectedOption.displayValue ??
    item.optionDisplayValue ??
    item.variantDisplayValue ??
    buildDisplayValue(optionValue, optionUnit);

  const buyerPrice = Number(
    item.buyerPrice ??
    selectedOption.buyerPrice ??
    item.price ??
    0
  );

  const sellerPrice = Number(
    item.sellerPrice ??
    selectedOption.sellerPrice ??
    item.merchantPrice ??
    buyerPrice
  );

  const quantity = Math.max(1, Number(item.quantity || 1));
  const price = Number(item.price ?? buyerPrice ?? 0);
  const subtotal = Number(item.subtotal ?? price * quantity);

  return {
    ...item,
    productId: item.productId || item.id || "",
    sellerId: item.sellerId || "",
    shopName: item.shopName || item.sellerName || "",
    title: item.title || item.productTitle || item.name || "Item",
    quantity,
    price,
    buyerPrice,
    sellerPrice,
    subtotal,
    image:
      item.optionImage ||
      selectedOption.image ||
      item.image ||
      item.imageUrl ||
      item.productImage ||
      "",
    optionImage:
      item.optionImage ||
      selectedOption.image ||
      "",
    selectedOptionName: String(optionName || "").trim(),
    selectedOptionValue: String(optionValue ?? "").trim(),
    selectedOptionUnit: String(optionUnit || "").trim(),
    selectedOptionDisplayValue: String(displayValue || "").trim(),
    measurementValue: String(
      item.measurementValue ??
      selectedOption.measurementValue ??
      optionValue ??
      ""
    ).trim(),
    measurementUnit: String(
      item.measurementUnit ??
      selectedOption.measurementUnit ??
      optionUnit ??
      ""
    ).trim(),
    sizeValue: String(
      item.sizeValue ??
      selectedOption.sizeValue ??
      optionValue ??
      ""
    ).trim(),
    sizeUnit: String(
      item.sizeUnit ??
      selectedOption.sizeUnit ??
      optionUnit ??
      ""
    ).trim(),
    sku: String(
      item.sku ??
      selectedOption.sku ??
      item.selectedOptionSku ??
      ""
    ).trim(),
    productCode: String(
      item.productCode ??
      selectedOption.productCode ??
      item.selectedOptionProductCode ??
      ""
    ).trim()
  };
}

function getItemOptionDisplay(item = {}) {
  const normalizedItem = normalizeDeliveryItem(item);

  if (normalizedItem.selectedOptionDisplayValue) {
    return normalizedItem.selectedOptionName
      ? `${normalizedItem.selectedOptionName}: ${normalizedItem.selectedOptionDisplayValue}`
      : normalizedItem.selectedOptionDisplayValue;
  }

  const value =
    normalizedItem.selectedOptionValue ||
    normalizedItem.measurementValue ||
    normalizedItem.sizeValue ||
    "";

  const unit =
    normalizedItem.selectedOptionUnit ||
    normalizedItem.measurementUnit ||
    normalizedItem.sizeUnit ||
    "";

  if (!value && !unit) return "";

  const display = buildDisplayValue(value, unit);

  return normalizedItem.selectedOptionName
    ? `${normalizedItem.selectedOptionName}: ${display}`
    : display;
}

function buildDisplayValue(value, unit) {
  const cleanValue = String(value ?? "").trim();
  const cleanUnit = String(unit ?? "").trim();

  if (!cleanValue && !cleanUnit) return "";
  if (!cleanUnit) return cleanValue;
  if (!cleanValue) return cleanUnit;

  return `${cleanValue} ${cleanUnit}`.trim();
}

function itemSearchText(item = {}) {
  const normalizedItem = normalizeDeliveryItem(item);

  return [
    normalizedItem.title,
    normalizedItem.shopName,
    normalizedItem.selectedOptionName,
    normalizedItem.selectedOptionValue,
    normalizedItem.selectedOptionUnit,
    normalizedItem.selectedOptionDisplayValue,
    normalizedItem.measurementValue,
    normalizedItem.measurementUnit,
    normalizedItem.sizeValue,
    normalizedItem.sizeUnit,
    normalizedItem.sku,
    normalizedItem.productCode
  ].filter(Boolean).join(" ");
}

function deliveryItemHtml(item = {}) {
  const normalizedItem = normalizeDeliveryItem(item);
  const optionDisplay = getItemOptionDisplay(normalizedItem);
  const image = normalizedItem.optionImage || normalizedItem.image || "";

  return `
    <article class="delivery-product-item">
      ${
        image
          ? `
              <img
                class="delivery-product-image"
                src="${escapeHtml(image)}"
                alt="${escapeHtml(normalizedItem.title)}"
                loading="lazy"
              >
            `
          : `
              <div class="delivery-product-image delivery-product-image-placeholder">
                No image
              </div>
            `
      }

      <div class="delivery-product-content">
        <div class="delivery-product-heading">
          <strong>${escapeHtml(normalizedItem.title)}</strong>
          <span>× ${normalizedItem.quantity}</span>
        </div>

        ${
          optionDisplay
            ? `
                <p class="delivery-product-option">
                  <strong>Selected option:</strong>
                  ${escapeHtml(optionDisplay)}
                </p>
              `
            : ""
        }

        <div class="delivery-product-meta">
          ${
            normalizedItem.productCode
              ? `<span><strong>Product code:</strong> ${escapeHtml(normalizedItem.productCode)}</span>`
              : ""
          }

          ${
            normalizedItem.sku
              ? `<span><strong>SKU:</strong> ${escapeHtml(normalizedItem.sku)}</span>`
              : ""
          }

          ${
            normalizedItem.shopName
              ? `<span><strong>Seller:</strong> ${escapeHtml(normalizedItem.shopName)}</span>`
              : ""
          }
        </div>

        <div class="delivery-product-pricing">
          <span>Unit price: Rs ${formatMoney(normalizedItem.price)}</span>
          <strong>Subtotal: Rs ${formatMoney(normalizedItem.subtotal)}</strong>
        </div>
      </div>
    </article>
  `;
}

function setLoading() {
  if (deliveryOrdersList) {
    deliveryOrdersList.setAttribute("aria-busy", "true");
    deliveryOrdersList.innerHTML = `
      <div class="delivery-empty-state">
        <h3>Loading deliveries...</h3>
        <p>Please wait while MauMarket loads delivery orders.</p>
      </div>
    `;
  }

  if (deliveryResultCount) {
    deliveryResultCount.textContent = "Loading delivery orders...";
  }
}

function renderError(message) {
  if (deliveryOrdersList) {
    deliveryOrdersList.setAttribute("aria-busy", "false");
    deliveryOrdersList.innerHTML = `
      <div class="delivery-empty-state">
        <h3>Could not load deliveries</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}


function getLatitude(order) {
  return (
    Number(order.deliveryLatitude || 0) ||
    Number(order.deliveryLocation?.lat || 0) ||
    Number(order.location?.lat || 0) ||
    Number(order.lat || 0)
  );
}

function getLongitude(order) {
  return (
    Number(order.deliveryLongitude || 0) ||
    Number(order.deliveryLocation?.lng || 0) ||
    Number(order.location?.lng || 0) ||
    Number(order.lng || 0)
  );
}

function hasCoordinates(order) {
  return Boolean(getLatitude(order) && getLongitude(order));
}

function getMapUrl(order) {
  const lat = getLatitude(order);
  const lng = getLongitude(order);

  if (lat && lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  if (order.deliveryAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`;
  }

  return "";
}

function shortText(value, max = 40) {
  const text = String(value || "");

  if (text.length <= max) return text;

  return `${text.slice(0, max)}...`;
}

function getOrderDeliveryDate(order) {
  if (order.deliveryDateText) return order.deliveryDateText;
  if (order.deliveryDate) return order.deliveryDate;

  if (order.scheduledDeliveryDate?.seconds) {
    return timestampToDateInput(order.scheduledDeliveryDate);
  }

  return "";
}

function timestampToDateInput(timestamp) {
  const date = new Date(timestamp.seconds * 1000);

  return date.toISOString().slice(0, 10);
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function getStatusClass(status) {
  const value = normalize(status);

  if (value.includes("delivered")) return "success";
  if (value.includes("cancel")) return "danger";
  if (value.includes("out")) return "warning";
  if (value.includes("submitted")) return "info";
  if (value.includes("picked")) return "info";
  if (value.includes("ready")) return "purple";

  return "neutral";
}

function getPriorityClass(priority) {
  const value = normalize(priority);

  if (value.includes("urgent")) return "danger";
  if (value.includes("high")) return "warning";
  if (value.includes("fragile")) return "purple";

  return "neutral";
}

function timelineStep(currentStatus, stepStatus, label) {
  const steps = [
    "Preparing Order",
    "Ready for Pickup",
    "Picked Up",
    "Out for Delivery",
    "Delivery Submitted",
    "Delivered"
  ];

  if (currentStatus === "Cancelled" || currentStatus === "Payment Rejected") {
    return `
      <span class="delivery-step cancelled">
        ${escapeHtml(label)}
      </span>
    `;
  }

  const currentIndex = steps.indexOf(currentStatus || "Preparing Order");
  const stepIndex = steps.indexOf(stepStatus);

  const done = currentIndex >= stepIndex;

  return `
    <span class="delivery-step ${done ? "done" : ""}">
      ${escapeHtml(label)}
    </span>
  `;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
