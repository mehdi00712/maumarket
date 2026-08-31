/**
 * MauMarket Delivery Dashboard
 * Product-option compatible version.
 *
 * Supports:
 * - selectedOptionName
 * - selectedOptionValue
 * - selectedOptionUnit
 * - selectedOptionDisplayValue
 * - measurementValue / measurementUnit
 * - sizeValue / sizeUnit
 * - buyerPrice / sellerPrice
 * - SKU / productCode
 * - option-specific images
 * - multi-seller pickup routes
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
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const deliveryOrdersList = document.getElementById("deliveryOrdersList");

const refreshBtn = document.getElementById("refreshDriverDeliveriesBtn");
const searchInput = document.getElementById("driverDeliverySearch");
const statusFilter = document.getElementById("driverDeliveryStatusFilter");
const dateFilter = document.getElementById("driverDeliveryDateFilter");
const resultCount = document.getElementById("driverDeliveryResultCount");
const clearFiltersBtn = document.getElementById("clearDriverDeliveryFiltersBtn");

const totalEl = document.getElementById("driverTotalDeliveries");
const activeEl = document.getElementById("driverActiveDeliveries");
const pickedEl = document.getElementById("driverPickedUpDeliveries");
const outEl = document.getElementById("driverOutDeliveries");
const submittedEl = document.getElementById("driverSubmittedDeliveries");
const deliveredEl = document.getElementById("driverDeliveredDeliveries");

let currentUser = null;
let currentUserData = null;
let allJobs = [];
let filteredJobs = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
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

    bindEvents();
    await loadOrders();
  } catch (error) {
    renderError(getFriendlyDeliveryError(error,'The delivery dashboard could not be loaded.'));
  }
});

function bindEvents() {
  if (document.body.dataset.driverDeliveryEventsBound === "true") return;

  document.body.dataset.driverDeliveryEventsBound = "true";

  refreshBtn?.addEventListener("click", async () => {
    await loadOrders();
  });

  searchInput?.addEventListener("input", applyFilters);
  statusFilter?.addEventListener("change", applyFilters);
  dateFilter?.addEventListener("change", applyFilters);
  clearFiltersBtn?.addEventListener("click", clearDriverFilters);
}

async function loadOrders() {
  setLoading();
  setRefreshLoading(true);

  try {
    const q = query(
      collection(db, "deliveryJobs"),
      where("driverId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    allJobs = [];

    snapshot.forEach((docSnap) => {
      allJobs.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    allJobs.sort((a, b) => {
      return getJobTime(b) - getJobTime(a);
    });

    applyFilters();
  } catch (error) {
    renderError(getFriendlyDeliveryError(error,'The delivery dashboard could not be loaded.'));
  } finally {
    setRefreshLoading(false);
  }
}

function clearDriverFilters() {
  if (searchInput) searchInput.value = "";
  if (statusFilter) statusFilter.value = "";
  if (dateFilter) dateFilter.value = "";

  applyFilters();

  document.querySelector(".driver-delivery-main-card")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function setRefreshLoading(isLoading) {
  if (!refreshBtn) return;

  if (isLoading) {
    refreshBtn.dataset.originalText = refreshBtn.textContent || "Refresh Deliveries";
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing...";
    return;
  }

  refreshBtn.disabled = false;
  refreshBtn.textContent = refreshBtn.dataset.originalText || "Refresh Deliveries";
}

function applyFilters() {
  const search = normalize(searchInput?.value || "");
  const status = statusFilter?.value || "";
  const date = dateFilter?.value || "";

  filteredJobs = allJobs.filter((job) => {
    const text = normalize(`
      ${job.id}
      ${job.orderId || ""}
      ${job.customerName || ""}
      ${job.customerPhone || ""}
      ${job.deliveryAddress || ""}
      ${job.orderNotes || ""}
      ${job.orderStatus || ""}
      ${job.deliveryStatus || ""}
      ${(job.items || []).map((item) => itemSearchText(item)).join(" ")}
      ${(normalizePickupStops(job)).map((stop) => `
        ${stop.shopName || ""}
        ${stop.pickupAddress || ""}
        ${(stop.items || []).map((item) => itemSearchText(item)).join(" ")}
      `).join(" ")}
    `);

    const jobDate = getJobDate(job);

    const matchesSearch = !search || text.includes(search);
    const currentStatus = job.orderStatus || job.deliveryStatus || "";
    const matchesStatus = !status || normalize(currentStatus) === normalize(status);
    const matchesDate = !date || jobDate === date;

    return matchesSearch && matchesStatus && matchesDate;
  });

  updateStats();
  renderJobs(filteredJobs);
}

function updateStats() {
  const total = allJobs.length;

  const active = allJobs.filter((job) => {
    return (
      job.orderStatus !== "Delivered" &&
      job.orderStatus !== "Cancelled" &&
      job.active !== false
    );
  }).length;

  const picked = allJobs.filter((job) => job.orderStatus === "Picked Up").length;
  const out = allJobs.filter((job) => job.orderStatus === "Out for Delivery").length;
  const submitted = allJobs.filter((job) => job.orderStatus === "Delivery Submitted").length;

  const delivered = allJobs.filter((job) => {
    return job.orderStatus === "Delivered" || job.active === false;
  }).length;

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (pickedEl) pickedEl.textContent = picked;
  if (outEl) outEl.textContent = out;
  if (submittedEl) submittedEl.textContent = submitted;
  if (deliveredEl) deliveredEl.textContent = delivered;

  if (resultCount) {
    resultCount.textContent = `${filteredJobs.length} assigned deliver${filteredJobs.length === 1 ? "y" : "ies"} found`;
  }
}

function renderJobs(jobs) {
  if (!deliveryOrdersList) return;

  deliveryOrdersList.setAttribute("aria-busy", "false");

  if (jobs.length === 0) {
    deliveryOrdersList.innerHTML = `
      <div class="driver-empty-state">
        <div class="driver-empty-icon">📦</div>
        <h3>No deliveries found</h3>
        <p>No assigned deliveries match your current filters.</p>
        <div class="driver-empty-actions">
          <button type="button" class="secondary-btn" data-empty-action="clear">Clear Filters</button>
          <button type="button" class="btn" data-empty-action="refresh">Refresh Deliveries</button>
        </div>
      </div>
    `;
    return;
  }

  deliveryOrdersList.innerHTML = jobs.map((job) => deliveryCardHtml(job)).join("");

  deliveryOrdersList.querySelectorAll("[data-driver-action]").forEach((button) => {
    button.addEventListener("click", handleDriverAction);
  });

  deliveryOrdersList.querySelectorAll(".signature-canvas").forEach((canvas) => {
    const orderId = canvas.dataset.orderId;
    const jobId = canvas.dataset.jobId;
    const card = canvas.closest(".driver-delivery-card");

    setupSignature(orderId, jobId, card);
  });

  deliveryOrdersList.querySelector('[data-empty-action="clear"]')?.addEventListener("click", clearDriverFilters);
  deliveryOrdersList.querySelector('[data-empty-action="refresh"]')?.addEventListener("click", loadOrders);
}

function deliveryCardHtml(order) {
  const orderId = order.orderId || order.id;
  const jobId = order.id;
  const status = order.orderStatus || "Ready for Pickup";
  const deliveryStatus = order.deliveryStatus || "assigned";
  const isCompleted = status === "Delivered" || order.active === false;

  const mapUrl = getMapUrl(order);

  const showPickupButton =
    !isCompleted &&
    (
      status === "Ready for Pickup" ||
      deliveryStatus === "assigned"
    );

  const showOutButton =
    !isCompleted &&
    status === "Picked Up";

  const showSignatureBox =
    !isCompleted &&
    (
      status === "Out for Delivery" ||
      deliveryStatus === "rejected"
    );

  const pickupHtml = renderPickupStops(normalizePickupStops(order));

  const itemsHtml = (order.items || [])
    .map((item) => deliveryItemHtml(item))
    .join("");

  return `
    <article class="driver-delivery-card" data-order-id="${escapeHtml(orderId)}">

      <div class="driver-card-head">
        <div>
          <span class="driver-order-id">Order #${escapeHtml(String(orderId).slice(0, 8))}</span>
          <h3>${escapeHtml(order.customerName || "Customer")}</h3>
          <p>${escapeHtml(order.deliveryAddress || "No delivery address")}</p>
        </div>

        <span class="driver-status-pill ${statusClass(status)}">
          ${escapeHtml(status)}
        </span>
      </div>

      <div class="driver-progress">
        ${progressStep(status, "Ready for Pickup", "Ready")}
        ${progressStep(status, "Picked Up", "Picked Up")}
        ${progressStep(status, "Out for Delivery", "Out")}
        ${progressStep(status, "Delivery Submitted", "Submitted")}
        ${progressStep(status, "Delivered", "Delivered")}
      </div>

      <div class="driver-info-grid">
        <div>
          <small>Customer</small>
          <strong>${escapeHtml(order.customerName || "Customer")}</strong>
          <span>${escapeHtml(order.customerPhone || "No phone")}</span>
        </div>

        <div>
          <small>Pinned Location</small>
          <strong>${escapeHtml(shortText(order.deliveryAddress || "No address", 42))}</strong>
          <span>${hasCoordinates(order) ? "Exact map pin available" : "Address only"}</span>
        </div>

        <div>
          <small>Total</small>
          <strong>Rs ${formatMoney(order.grandTotal || 0)}</strong>
          <span>Delivery fee: Rs ${formatMoney(order.deliveryFee || 0)}</span>
        </div>

        <div>
          <small>Schedule</small>
          <strong>${escapeHtml(getJobDate(order) || "Not scheduled")}</strong>
          <span>${escapeHtml(order.deliveryTimeSlot || "No time slot")}</span>
        </div>
      </div>

      <details class="driver-details">
        <summary>View package details</summary>

        <div class="driver-detail-grid">
          <div>
            <h4>Pickup Locations</h4>
            ${pickupHtml}

            <h4>Items and Selected Options</h4>

            <div class="driver-items-list">
              ${itemsHtml || `<p class="muted">No items found.</p>`}
            </div>
          </div>

          <div>
            <h4>Delivery Notes</h4>
            <p>${escapeHtml(order.orderNotes || order.deliveryNotes || "No notes.")}</p>

            ${
              hasCoordinates(order)
                ? `
                  <div class="driver-location-box">
                    <strong>Pinned Coordinates</strong>
                    <p>${Number(getLatitude(order)).toFixed(6)}, ${Number(getLongitude(order)).toFixed(6)}</p>
                  </div>
                `
                : ""
            }

            ${
              order.adminDeliveryRejectReason
                ? `
                  <div class="driver-warning-box">
                    <strong>Admin rejected previous submission</strong>
                    <p>${escapeHtml(order.adminDeliveryRejectReason)}</p>
                  </div>
                `
                : ""
            }
          </div>
        </div>
      </details>

      ${
        order.deliverySignature
          ? `
            <div class="driver-signature-preview">
              <h4>Submitted Signature</h4>
              <img src="${escapeHtml(order.deliverySignature)}" alt="Customer signature">
              <p><strong>Signed by:</strong> ${escapeHtml(order.deliverySignedBy || "Customer")}</p>
              <p><strong>Note:</strong> ${escapeHtml(order.deliveryNote || "None")}</p>
            </div>
          `
          : ""
      }

      <div class="driver-card-actions">
        ${
          showPickupButton
            ? `
              <button
                type="button"
                class="ready-btn"
                data-driver-action="pickup"
                data-order-id="${escapeHtml(orderId)}">
                Mark Picked Up
              </button>
            `
            : ""
        }

        ${
          showOutButton
            ? `
              <button
                type="button"
                class="update-status-btn"
                data-driver-action="out"
                data-order-id="${escapeHtml(orderId)}">
                Start Delivery
              </button>
            `
            : ""
        }

        <button
          type="button"
          class="secondary-btn"
          data-driver-action="print"
          data-order-id="${escapeHtml(orderId)}">
          Print Note
        </button>

        ${
          order.customerPhone
            ? `
              <a
                class="secondary-btn"
                href="tel:${escapeHtml(order.customerPhone)}">
                Call Customer
              </a>
            `
            : ""
        }
        ${
          order.customerPhone
            ? `
              <a
                class="secondary-btn whatsapp-driver-btn"
                target="_blank"
                rel="noopener"
                href="${escapeHtml(getWhatsAppUrl(order))}">
                WhatsApp Customer
              </a>
            `
            : ""
        }

        ${
          mapUrl
            ? `
              <a
                class="secondary-btn map-btn"
                target="_blank"
                rel="noopener"
                href="${escapeHtml(mapUrl)}">
                Open Pinned Location
              </a>
            `
            : ""
        }
      </div>

      ${
        showSignatureBox
          ? `
            <section class="driver-signature-section">
              <div class="section-row-title">
                <div>
                  <h3>Customer Signature</h3>
                  <p>Ask the customer to sign after receiving the order.</p>
                </div>
              </div>

              <canvas
                class="signature-canvas"
                data-order-id="${escapeHtml(orderId)}"
                data-job-id="${escapeHtml(jobId)}">
              </canvas>

              <div class="driver-signature-fields">
                <input class="customer-name" placeholder="Customer full name">
                <textarea class="delivery-note" placeholder="Delivery note optional"></textarea>
              </div>

              <div class="driver-card-actions">
                <button class="secondary-btn clear-signature-btn" type="button">
                  Clear Signature
                </button>

                <button class="submit-delivery-btn" type="button">
                  Submit Delivery
                </button>
              </div>
            </section>
          `
          : ""
      }

    </article>
  `;
}

async function handleDriverAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.driverAction;
  const orderId = button.dataset.orderId;

  const job = allJobs.find((item) => {
    return (item.orderId || item.id) === orderId || item.id === orderId;
  });

  if (!job) {
    alert("Delivery job not found.");
    return;
  }

  const jobId = job.id;
  const actualOrderId = job.orderId || job.id;

  if (action === "pickup") {
    if (!confirm("Confirm that all items, selected options and product codes have been collected from the seller(s)?")) {
      return;
    }

    await updateDelivery(jobId, actualOrderId, {
      orderStatus: "Picked Up",
      deliveryStatus: "picked_up",
      pickedUpAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadOrders();
    return;
  }

  if (action === "out") {
    if (!confirm("Start delivery to the customer now?")) {
      return;
    }

    await updateDelivery(jobId, actualOrderId, {
      orderStatus: "Out for Delivery",
      deliveryStatus: "out_for_delivery",
      outForDeliveryAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await loadOrders();
    return;
  }

  if (action === "print") {
    printDeliveryNote(job);
  }
}

function setupSignature(orderId, jobId, card) {
  const canvas = card.querySelector(".signature-canvas");

  if (!canvas || typeof SignaturePad === "undefined") {
    const section = card.querySelector(".driver-signature-section");

    if (section) {
      section.innerHTML = `
        <h3>Signature Error</h3>
        <p>SignaturePad library is missing. Check delivery.html script link.</p>
      `;
    }

    return;
  }

  resizeCanvas(canvas);

  const signaturePad = new SignaturePad(canvas, {
    minWidth: 1,
    maxWidth: 2.5,
    backgroundColor: "#ffffff"
  });

  card.querySelector(".clear-signature-btn")?.addEventListener("click", () => {
    signaturePad.clear();
  });

  card.querySelector(".submit-delivery-btn")?.addEventListener("click", async () => {
    if (signaturePad.isEmpty()) {
      alert("Customer signature required.");
      return;
    }

    const customerName = card.querySelector(".customer-name")?.value.trim();

    if (!customerName) {
      alert("Customer full name is required.");
      return;
    }

    const deliveryNote = card.querySelector(".delivery-note")?.value.trim() || "";
    const submitBtn = card.querySelector(".submit-delivery-btn");

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const signature = signaturePad.toDataURL("image/png");

      await updateDelivery(jobId, orderId, {
        deliverySignature: signature,
        deliverySignedBy: customerName,
        deliveryNote,
        deliveryGuyName: getDriverName(),
        driverName: getDriverName(),
        deliveryStatus: "awaiting_admin_validation",
        orderStatus: "Delivery Submitted",
        deliverySubmittedAt: serverTimestamp(),
        active: true,
        updatedAt: serverTimestamp()
      });

      alert("Delivery submitted for admin validation.");
      await loadOrders();
    } catch (error) {
      console.error("Delivery submission failed:", error);
      alert(
        getFriendlyDeliveryError(
          error,
          error?.message || "The delivery could not be submitted. Please try again."
        )
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Delivery";
    }
  });
}

async function updateDelivery(jobId, orderId, data) {
  if (!jobId) {
    throw new Error("Delivery job ID is missing.");
  }

  if (!orderId) {
    throw new Error("Order ID is missing.");
  }

  console.log("Updating delivery job:", jobId, data);

  // Primary source of truth for the driver workflow.
  // If this fails, surface the real Firestore error to the user.
  await updateDoc(doc(db, "deliveryJobs", jobId), data);

  console.log("Delivery job updated successfully:", jobId);

  // Secondary sync to the main order.
  // A permission problem here must NOT make the driver submission look failed
  // because deliveryJobs was already saved successfully.
  try {
    await updateDoc(doc(db, "orders", orderId), data);
    console.log("Order synced successfully:", orderId);
  } catch (error) {
    console.warn(
      "Order sync skipped after successful delivery job update:",
      error?.code || error?.message,
      error
    );
  }
}

function printDeliveryNote(job) {
  const orderId = job.orderId || job.id;
  const mapUrl = getMapUrl(job);

  const pickupRows = renderPickupStops(normalizePickupStops(job));

  const itemsRows = (job.items || []).map((item) => {
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
    <html>
      <head>
        <title>Delivery Note</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            padding: 30px;
          }

          .print-page {
            max-width: 900px;
            margin: auto;
          }

          .print-head {
            border-bottom: 3px solid #4f35f5;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }

          .print-head h1 {
            margin: 0;
            color: #4f35f5;
          }

          .print-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            margin-bottom: 24px;
          }

          .print-box {
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            padding: 16px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border: 1px solid #e5e7eb;
            padding: 10px;
            text-align: left;
          }

          th {
            background: #f3f4f6;
          }

          .total {
            margin-top: 24px;
            text-align: right;
          }

          .signature {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 36px;
            margin-top: 70px;
          }

          .signature div {
            border-top: 2px solid #111827;
            padding-top: 10px;
          }

          .map-link {
            color: #4f35f5;
            font-weight: bold;
          }
        </style>
      </head>

      <body>
        <main class="print-page">
          <header class="print-head">
            <h1>MauMarket Delivery Note</h1>
            <p>Order #${escapeHtml(orderId)}</p>
          </header>

          <section class="print-grid">
            <div class="print-box">
              <h3>Customer</h3>
              <p><strong>Name:</strong> ${escapeHtml(job.customerName || "")}</p>
              <p><strong>Phone:</strong> ${escapeHtml(job.customerPhone || "")}</p>
              <p><strong>Address:</strong> ${escapeHtml(job.deliveryAddress || "")}</p>
              ${
                hasCoordinates(job)
                  ? `<p><strong>Pin:</strong> ${Number(getLatitude(job)).toFixed(6)}, ${Number(getLongitude(job)).toFixed(6)}</p>`
                  : ""
              }
              ${
                mapUrl
                  ? `<p><a class="map-link" href="${escapeHtml(mapUrl)}" target="_blank">Open pinned location</a></p>`
                  : ""
              }
            </div>

            <div class="print-box">
              <h3>Delivery</h3>
              <p><strong>Driver:</strong> ${escapeHtml(getDriverName())}</p>
              <p><strong>Status:</strong> ${escapeHtml(job.orderStatus || "")}</p>
              <p><strong>Time slot:</strong> ${escapeHtml(job.deliveryTimeSlot || "Not set")}</p>
              <p><strong>Notes:</strong> ${escapeHtml(job.orderNotes || "None")}</p>
            </div>
          </section>

          <h3>Pickup Locations</h3>${pickupRows}<h3>Items</h3>

          <table>
            <thead>
              <tr>
                <th>Item / Selected Option</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              ${
                itemsRows ||
                `
                  <tr>
                    <td colspan="4">No items found.</td>
                  </tr>
                `
              }
            </tbody>
          </table>

          <div class="total">
            <p><strong>Delivery Fee:</strong> Rs ${formatMoney(job.deliveryFee || 0)}</p>
            <h2>Total: Rs ${formatMoney(job.grandTotal || 0)}</h2>
          </div>

          <section class="signature">
            <div>Customer Signature</div>
            <div>Driver Signature</div>
          </section>
        </main>
      </body>
    </html>
  `;

  const win = window.open("", "_blank", "width=1000,height=800");

  win.document.open();
  win.document.write(html);
  win.document.close();

  win.onload = () => {
    win.focus();
    win.print();
  };
}



/* =========================
   PICKUP HELPERS
========================= */
function normalizePickupStops(order) {
  if (Array.isArray(order.pickupStops) && order.pickupStops.length > 0) {
    return order.pickupStops.map((stop) => normalizePickupStop(stop));
  }

  if (Array.isArray(order.sellerBreakdown) && order.sellerBreakdown.length > 0) {
    return order.sellerBreakdown.map((stop) => normalizePickupStop(stop));
  }

  const grouped = {};

  (order.items || []).forEach((item) => {
    const normalizedItem = normalizeDeliveryItem(item);
    const sellerId = normalizedItem.sellerId || "unknown";

    if (!grouped[sellerId]) {
      grouped[sellerId] = {
        sellerId,
        shopName: normalizedItem.shopName || "Shop",
        shopLocation: item.shopLocation || "",
        shopAddress: item.shopAddress || "",
        pickupAddress:
          item.pickupAddress ||
          item.shopAddress ||
          item.shopLocation ||
          "",
        pickupLatitude:
          item.pickupLatitude ??
          item.pickupLocation?.lat ??
          null,
        pickupLongitude:
          item.pickupLongitude ??
          item.pickupLocation?.lng ??
          null,
        items: []
      };
    }

    grouped[sellerId].items.push(normalizedItem);
  });

  return Object.values(grouped).map((stop) => normalizePickupStop(stop));
}

function normalizePickupStop(stop = {}) {
  const latitude = Number(
    stop.pickupLatitude ??
    stop.pickupLocation?.lat ??
    stop.latitude ??
    0
  );

  const longitude = Number(
    stop.pickupLongitude ??
    stop.pickupLocation?.lng ??
    stop.longitude ??
    0
  );

  return {
    ...stop,
    sellerId: stop.sellerId || "",
    shopName: stop.shopName || stop.name || "Shop",
    shopLocation: stop.shopLocation || stop.location || "",
    shopAddress: stop.shopAddress || stop.address || "",
    pickupAddress:
      stop.pickupAddress ||
      stop.shopAddress ||
      stop.shopLocation ||
      stop.address ||
      stop.location ||
      "",
    pickupLatitude: latitude || null,
    pickupLongitude: longitude || null,
    pickupLocation:
      latitude && longitude
        ? { lat: latitude, lng: longitude }
        : null,
    items: Array.isArray(stop.items)
      ? stop.items.map((item) => normalizeDeliveryItem(item))
      : []
  };
}

function renderPickupStops(stops) {
  if (!stops.length) {
    return `<p class="muted">No pickup locations saved.</p>`;
  }

  return stops.map((stop, index) => {
    const mapUrl = getPickupMapUrl(stop);

    const itemRows = (stop.items || []).map((item) => {
      const normalizedItem = normalizeDeliveryItem(item);
      const optionDisplay = getItemOptionDisplay(normalizedItem);

      return `
        <li>
          <strong>${escapeHtml(normalizedItem.title)}</strong>
          ${optionDisplay ? `<span> — ${escapeHtml(optionDisplay)}</span>` : ""}
          ${normalizedItem.productCode ? `<span> — Code: ${escapeHtml(normalizedItem.productCode)}</span>` : ""}
          ${normalizedItem.sku ? `<span> — SKU: ${escapeHtml(normalizedItem.sku)}</span>` : ""}
          <span> × ${normalizedItem.quantity}</span>
        </li>
      `;
    }).join("");

    return `
      <article class="pickup-stop-card">
        <div class="pickup-stop-head">
          <span>Pickup ${index + 1}</span>
          <strong>${escapeHtml(stop.shopName)}</strong>
        </div>

        <p>
          <strong>Address:</strong>
          ${escapeHtml(stop.pickupAddress || "Pickup location not set")}
        </p>

        ${
          stop.pickupLatitude && stop.pickupLongitude
            ? `
                <p>
                  <strong>Pin:</strong>
                  ${Number(stop.pickupLatitude).toFixed(6)},
                  ${Number(stop.pickupLongitude).toFixed(6)}
                </p>
              `
            : ""
        }

        <ul>
          ${itemRows || "<li>No items listed for this pickup.</li>"}
        </ul>

        ${
          mapUrl
            ? `
                <a
                  class="secondary-btn map-btn"
                  href="${escapeHtml(mapUrl)}"
                  target="_blank"
                  rel="noopener"
                >
                  Open Pickup Map
                </a>
              `
            : ""
        }
      </article>
    `;
  }).join("");
}

function getPickupMapUrl(stop) {
  if (stop.pickupLatitude && stop.pickupLongitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${stop.pickupLatitude},${stop.pickupLongitude}`
    )}`;
  }

  const address =
    stop.pickupAddress ||
    stop.shopAddress ||
    stop.shopLocation ||
    "";

  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function normalizeDeliveryItem(item = {}) {
  const selectedOption =
    item.selectedOption && typeof item.selectedOption === "object"
      ? item.selectedOption
      : {};

  const selectedOptionName =
    item.selectedOptionName ??
    selectedOption.name ??
    item.optionName ??
    item.variantName ??
    "";

  const selectedOptionValue =
    item.selectedOptionValue ??
    selectedOption.value ??
    item.optionValue ??
    item.variantValue ??
    item.measurementValue ??
    item.sizeValue ??
    "";

  const selectedOptionUnit =
    item.selectedOptionUnit ??
    selectedOption.unit ??
    item.optionUnit ??
    item.variantUnit ??
    item.measurementUnit ??
    item.sizeUnit ??
    "";

  const selectedOptionDisplayValue =
    item.selectedOptionDisplayValue ??
    selectedOption.displayValue ??
    item.optionDisplayValue ??
    item.variantDisplayValue ??
    buildDisplayValue(selectedOptionValue, selectedOptionUnit);

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
    selectedOptionName: String(selectedOptionName || "").trim(),
    selectedOptionValue: String(selectedOptionValue ?? "").trim(),
    selectedOptionUnit: String(selectedOptionUnit || "").trim(),
    selectedOptionDisplayValue: String(selectedOptionDisplayValue || "").trim(),
    measurementValue: String(
      item.measurementValue ??
      selectedOption.measurementValue ??
      selectedOptionValue ??
      ""
    ).trim(),
    measurementUnit: String(
      item.measurementUnit ??
      selectedOption.measurementUnit ??
      selectedOptionUnit ??
      ""
    ).trim(),
    sizeValue: String(
      item.sizeValue ??
      selectedOption.sizeValue ??
      selectedOptionValue ??
      ""
    ).trim(),
    sizeUnit: String(
      item.sizeUnit ??
      selectedOption.sizeUnit ??
      selectedOptionUnit ??
      ""
    ).trim(),
    sku: String(
      item.sku ??
      item.selectedOptionSku ??
      item.optionSku ??
      selectedOption.sku ??
      ""
    ).trim(),
    productCode: String(
      item.productCode ??
      item.selectedOptionProductCode ??
      selectedOption.productCode ??
      ""
    ).trim()
  };
}

function buildDisplayValue(value, unit) {
  const cleanValue = String(value ?? "").trim();
  const cleanUnit = String(unit ?? "").trim();

  if (!cleanValue && !cleanUnit) return "";
  if (!cleanUnit) return cleanValue;
  if (!cleanValue) return cleanUnit;

  return `${cleanValue} ${cleanUnit}`.trim();
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

  const displayValue = buildDisplayValue(value, unit);

  if (!displayValue) return "";

  return normalizedItem.selectedOptionName
    ? `${normalizedItem.selectedOptionName}: ${displayValue}`
    : displayValue;
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
    <article class="driver-product-item">
      ${
        image
          ? `
              <img
                class="driver-product-image"
                src="${escapeHtml(image)}"
                alt="${escapeHtml(normalizedItem.title)}"
                loading="lazy"
              >
            `
          : `
              <div class="driver-product-image driver-product-image-placeholder">
                No image
              </div>
            `
      }

      <div class="driver-product-content">
        <div class="driver-product-heading">
          <strong>${escapeHtml(normalizedItem.title)}</strong>
          <span>× ${normalizedItem.quantity}</span>
        </div>

        ${
          optionDisplay
            ? `
                <p class="driver-product-option">
                  <strong>Selected option:</strong>
                  ${escapeHtml(optionDisplay)}
                </p>
              `
            : ""
        }

        <div class="driver-product-meta">
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

        <div class="driver-product-pricing">
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
      <div class="driver-empty-state driver-loading-state">
        <div class="driver-loading-spinner" aria-hidden="true"></div>
        <h3>Loading assigned deliveries...</h3>
        <p>Please wait while MauMarket loads your delivery jobs.</p>
      </div>
    `;
  }

  if (resultCount) {
    resultCount.textContent = "Loading assigned deliveries...";
  }
}

function renderError(message) {
  if (deliveryOrdersList) {
    deliveryOrdersList.setAttribute("aria-busy", "false");
    deliveryOrdersList.innerHTML = `
      <div class="driver-empty-state">
        <h3>Could not load deliveries</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}

function resizeCanvas(canvas) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * ratio;
  canvas.height = 220 * ratio;

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
}

function progressStep(currentStatus, stepStatus, label) {
  const steps = [
    "Ready for Pickup",
    "Picked Up",
    "Out for Delivery",
    "Delivery Submitted",
    "Delivered"
  ];

  if (currentStatus === "Cancelled" || currentStatus === "Payment Rejected") {
    return `
      <span class="driver-step cancelled">
        ${escapeHtml(label)}
      </span>
    `;
  }

  const currentIndex = steps.indexOf(currentStatus || "Ready for Pickup");
  const stepIndex = steps.indexOf(stepStatus);

  return `
    <span class="driver-step ${currentIndex >= stepIndex ? "done" : ""}">
      ${escapeHtml(label)}
    </span>
  `;
}

function statusClass(status) {
  const value = normalize(status);

  if (value.includes("delivered")) return "success";
  if (value.includes("submitted")) return "info";
  if (value.includes("out")) return "warning";
  if (value.includes("picked")) return "purple";
  if (value.includes("ready")) return "neutral";

  return "neutral";
}

function getJobTime(job) {
  return (
    job.updatedAt?.seconds ||
    job.assignedAt?.seconds ||
    job.createdAt?.seconds ||
    0
  );
}

function getJobDate(job) {
  if (job.deliveryDateText) return job.deliveryDateText;
  if (job.deliveryDate) return job.deliveryDate;

  const timestamp =
    job.scheduledDeliveryDate ||
    job.assignedAt ||
    job.updatedAt ||
    job.createdAt;

  if (!timestamp?.seconds) return "";

  return new Date(timestamp.seconds * 1000).toISOString().slice(0, 10);
}

function getLatitude(job) {
  return (
    Number(job.deliveryLatitude || 0) ||
    Number(job.deliveryLocation?.lat || 0) ||
    Number(job.location?.lat || 0) ||
    Number(job.lat || 0)
  );
}

function getLongitude(job) {
  return (
    Number(job.deliveryLongitude || 0) ||
    Number(job.deliveryLocation?.lng || 0) ||
    Number(job.location?.lng || 0) ||
    Number(job.lng || 0)
  );
}

function hasCoordinates(job) {
  return Boolean(getLatitude(job) && getLongitude(job));
}

function getMapUrl(job) {
  const lat = getLatitude(job);
  const lng = getLongitude(job);

  if (lat && lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  if (job.deliveryAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.deliveryAddress)}`;
  }

  return "";
}

function getWhatsAppUrl(job) {
  const phone = normalizeMauritiusPhone(job.customerPhone || "");
  const orderId = job.orderId || job.id || "";
  const message = [
    "Hello, this is your MauMarket delivery driver.",
    "",
    `Order: ${String(orderId).slice(0, 12)}`,
    "I am contacting you regarding your delivery."
  ].join("\n");

  return `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`;
}

function normalizeMauritiusPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("230")) return digits;
  return `230${digits}`;
}

function getDriverName() {
  return (
    currentUserData?.name ||
    currentUserData?.fullName ||
    currentUser.displayName ||
    currentUser.email ||
    "Delivery Driver"
  );
}


function getFriendlyDeliveryError(error,fallback){
 const code=String(error?.code||"");
 const map={
  "permission-denied":"You do not have permission to access these deliveries.",
  "network-request-failed":"Please check your internet connection and try again.",
  "unavailable":"MauMarket is temporarily unavailable."
 };
 return map[code]||fallback;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function shortText(value, max = 40) {
  const text = String(value || "");

  if (text.length <= max) return text;

  return `${text.slice(0, max)}...`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
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
