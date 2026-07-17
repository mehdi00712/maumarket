import { db, auth } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/*
  MauMarket admin-featured-shops.js
  ------------------------------------------------------------
  Powers admin-featured-shops.html.

  Features:
  - Protects the page for MauMarket administrators
  - Loads Featured Shop requests
  - Loads matching seller and shop details
  - Searches and filters requests
  - Displays pending, active, rejected and expired requests
  - Previews image and PDF payment proofs
  - Approves a Featured Shop request for 30 days
  - Rejects a request with a required reason
  - Updates the seller's shop Featured Shop fields
  - Updates dashboard statistics and revenue
  - Handles older request/shop field names for compatibility
*/

const FEATURED_PLAN_PRICE = 500;
const FEATURED_DURATION_DAYS = 30;
const EXPIRING_SOON_DAYS = 7;

const featuredRequestsContainer = document.getElementById(
  "featuredRequestsContainer"
);
const featuredEmptyState = document.getElementById("featuredEmptyState");

const pendingFeaturedCount = document.getElementById(
  "pendingFeaturedCount"
);
const activeFeaturedCount = document.getElementById(
  "activeFeaturedCount"
);
const expiringFeaturedCount = document.getElementById(
  "expiringFeaturedCount"
);
const featuredRevenue = document.getElementById("featuredRevenue");

const featuredSearch = document.getElementById("featuredSearch");
const featuredStatusFilter = document.getElementById(
  "featuredStatusFilter"
);
const refreshFeaturedBtn = document.getElementById(
  "refreshFeaturedBtn"
);

const featuredRequestModal = document.getElementById(
  "featuredRequestModal"
);
const featuredRequestDetails = document.getElementById(
  "featuredRequestDetails"
);
const approveFeaturedBtn = document.getElementById(
  "approveFeaturedBtn"
);
const rejectFeaturedBtn = document.getElementById(
  "rejectFeaturedBtn"
);
const closeFeaturedModal = document.getElementById(
  "closeFeaturedModal"
);

let currentAdmin = null;
let allRequests = [];
let filteredRequests = [];
let selectedRequest = null;
let isProcessing = false;

attachEvents();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    redirectToLogin();
    return;
  }

  try {
    const isAdmin = await verifyAdminAccess(user.uid);

    if (!isAdmin) {
      alert("You do not have permission to access this page.");
      window.location.replace("dashboard.html");
      return;
    }

    currentAdmin = user;
    await loadFeaturedShopRequests();
  } catch (error) {
    console.error("Could not verify admin access:", error);
    showPageError(
      error.message || "Could not verify administrator access."
    );
  }
});

/* =========================================================
   ADMIN ACCESS
   ========================================================= */

async function verifyAdminAccess(uid) {
  const userSnapshot = await getDoc(doc(db, "users", uid));

  if (!userSnapshot.exists()) {
    return false;
  }

  const userData = userSnapshot.data();
  const role = String(userData.role || "").trim().toLowerCase();

  return role === "admin" || userData.isAdmin === true;
}

function redirectToLogin() {
  const returnUrl = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`
  );

  window.location.replace(`login.html?redirect=${returnUrl}`);
}

/* =========================================================
   LOAD FEATURED SHOP DATA
   ========================================================= */

async function loadFeaturedShopRequests() {
  showLoadingState();

  try {
    let requestSnapshot;

    try {
      requestSnapshot = await getDocs(
        query(
          collection(db, "featuredShopRequests"),
          orderBy("createdAt", "desc")
        )
      );
    } catch (indexError) {
      console.warn(
        "Falling back to unsorted Featured Shop request query:",
        indexError
      );

      requestSnapshot = await getDocs(
        collection(db, "featuredShopRequests")
      );
    }

    const rawRequests = requestSnapshot.docs.map((requestDoc) => ({
      id: requestDoc.id,
      ...requestDoc.data()
    }));

    const enrichedRequests = await Promise.all(
      rawRequests.map(enrichFeaturedRequest)
    );

    allRequests = enrichedRequests.sort(sortRequestsNewestFirst);

    applyFilters();
    updateStatistics();
  } catch (error) {
    console.error("Could not load Featured Shop requests:", error);
    showPageError(
      error.message || "Featured Shop requests could not be loaded."
    );
  }
}

async function enrichFeaturedRequest(request) {
  const sellerId = getRequestSellerId(request);

  let shopData = {};
  let userData = {};

  if (sellerId) {
    const [shopSnapshot, userSnapshot] = await Promise.all([
      getDoc(doc(db, "shops", sellerId)),
      getDoc(doc(db, "users", sellerId))
    ]);

    if (shopSnapshot.exists()) {
      shopData = {
        id: shopSnapshot.id,
        ...shopSnapshot.data()
      };
    }

    if (userSnapshot.exists()) {
      userData = {
        id: userSnapshot.id,
        ...userSnapshot.data()
      };
    }
  }

  const status = getRequestStatus(request);
  const expiry = getTimestampDate(
    request.featuredExpiry ||
      request.expiryDate ||
      shopData.featuredExpiry
  );

  return {
    ...request,
    sellerId,
    status,
    shopData,
    userData,
    featuredExpiryDate: expiry,
    isExpired:
      status === "expired" ||
      (status === "approved" && expiry && expiry.getTime() < Date.now())
  };
}

function getRequestSellerId(request) {
  return String(
    request.sellerId ||
      request.ownerId ||
      request.uid ||
      request.userId ||
      ""
  ).trim();
}

function getRequestStatus(request) {
  const rawStatus = String(
    request.status ||
      request.featuredStatus ||
      "pending"
  )
    .trim()
    .toLowerCase();

  if (rawStatus === "active") return "approved";
  if (rawStatus === "declined") return "rejected";

  return rawStatus;
}

function sortRequestsNewestFirst(a, b) {
  return getTimestampMilliseconds(b.createdAt) -
    getTimestampMilliseconds(a.createdAt);
}

/* =========================================================
   FILTERING AND RENDERING
   ========================================================= */

function applyFilters() {
  const searchTerm = String(featuredSearch?.value || "")
    .trim()
    .toLowerCase();

  const statusFilter = String(
    featuredStatusFilter?.value || ""
  )
    .trim()
    .toLowerCase();

  filteredRequests = allRequests.filter((request) => {
    const effectiveStatus = getEffectiveStatus(request);

    const searchableText = [
      request.shopName,
      request.businessName,
      request.sellerName,
      request.sellerEmail,
      request.sellerPhone,
      request.shopData?.shopName,
      request.shopData?.businessName,
      request.shopData?.phone,
      request.shopData?.location,
      request.userData?.name,
      request.userData?.email,
      request.userData?.phone,
      request.sellerId,
      request.id
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !searchTerm || searchableText.includes(searchTerm);

    const matchesStatus =
      !statusFilter || effectiveStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  renderRequests();
}

function renderRequests() {
  if (!featuredRequestsContainer) return;

  featuredRequestsContainer.innerHTML = "";

  if (!filteredRequests.length) {
    featuredRequestsContainer.style.display = "none";

    if (featuredEmptyState) {
      featuredEmptyState.style.display = "block";
    }

    return;
  }

  featuredRequestsContainer.style.display = "grid";

  if (featuredEmptyState) {
    featuredEmptyState.style.display = "none";
  }

  filteredRequests.forEach((request) => {
    featuredRequestsContainer.appendChild(
      createRequestCard(request)
    );
  });
}

function createRequestCard(request) {
  const card = document.createElement("article");
  const effectiveStatus = getEffectiveStatus(request);

  const shopName =
    request.shopData?.shopName ||
    request.shopName ||
    request.businessName ||
    "Unnamed Shop";

  const sellerName =
    request.userData?.name ||
    request.sellerName ||
    "MauMarket Seller";

  const sellerEmail =
    request.userData?.email ||
    request.sellerEmail ||
    "No email provided";

  const sellerPhone =
    request.shopData?.phone ||
    request.userData?.phone ||
    request.sellerPhone ||
    "No phone provided";

  const submittedAt = formatDateTime(request.createdAt);
  const amount = getRequestAmount(request);
  const proofUrl = getPaymentProofUrl(request);

  card.className =
    `featured-request-card featured-request-${effectiveStatus}`;

  card.innerHTML = `
    <div class="featured-request-card-header">
      <div>
        <span class="featured-status-badge ${escapeHtml(effectiveStatus)}">
          ${escapeHtml(formatStatusLabel(effectiveStatus))}
        </span>

        <h3>${escapeHtml(shopName)}</h3>
        <p>${escapeHtml(sellerName)}</p>
      </div>

      <strong class="featured-request-price">
        Rs ${formatMoney(amount)}
      </strong>
    </div>

    <div class="featured-request-meta">
      <div>
        <span>Seller email</span>
        <strong>${escapeHtml(sellerEmail)}</strong>
      </div>

      <div>
        <span>Phone</span>
        <strong>${escapeHtml(sellerPhone)}</strong>
      </div>

      <div>
        <span>Submitted</span>
        <strong>${escapeHtml(submittedAt)}</strong>
      </div>

      <div>
        <span>Visibility</span>
        <strong>
          ${request.showInExploreShops === false ? "Disabled" : "Enabled"}
        </strong>
      </div>
    </div>

    <div class="featured-request-card-footer">
      <span>
        ${proofUrl ? "Payment proof attached" : "No payment proof"}
      </span>

      <button
        type="button"
        class="btn featured-view-request-btn">
        Review Request
      </button>
    </div>
  `;

  card
    .querySelector(".featured-view-request-btn")
    ?.addEventListener("click", () => {
      openRequestModal(request);
    });

  return card;
}

/* =========================================================
   REQUEST MODAL
   ========================================================= */

function openRequestModal(request) {
  selectedRequest = request;

  renderRequestDetails(request);
  updateModalButtons(request);

  if (typeof featuredRequestModal?.showModal === "function") {
    featuredRequestModal.showModal();
  } else if (featuredRequestModal) {
    featuredRequestModal.setAttribute("open", "");
  }
}

function closeRequestModal() {
  if (isProcessing) return;

  selectedRequest = null;

  if (typeof featuredRequestModal?.close === "function") {
    featuredRequestModal.close();
  } else {
    featuredRequestModal?.removeAttribute("open");
  }
}

function renderRequestDetails(request) {
  if (!featuredRequestDetails) return;

  const effectiveStatus = getEffectiveStatus(request);

  const shopName =
    request.shopData?.shopName ||
    request.shopName ||
    request.businessName ||
    "Unnamed Shop";

  const sellerName =
    request.userData?.name ||
    request.sellerName ||
    "MauMarket Seller";

  const sellerEmail =
    request.userData?.email ||
    request.sellerEmail ||
    "Not provided";

  const sellerPhone =
    request.shopData?.phone ||
    request.userData?.phone ||
    request.sellerPhone ||
    "Not provided";

  const location =
    request.shopData?.location ||
    request.shopData?.address ||
    request.location ||
    "Mauritius";

  const proofUrl = getPaymentProofUrl(request);
  const proofType = getPaymentProofType(request, proofUrl);
  const publicShopUrl = buildPublicShopUrl(request.shopData, request);
  const expiryDate =
    request.featuredExpiryDate ||
    getTimestampDate(request.featuredExpiry);

  const proofMarkup = proofUrl
    ? createPaymentProofMarkup(proofUrl, proofType)
    : `
      <div class="featured-proof-empty">
        No payment proof was attached to this request.
      </div>
    `;

  featuredRequestDetails.innerHTML = `
    <section class="featured-admin-detail-section">
      <div class="featured-admin-detail-heading">
        <div>
          <span class="featured-status-badge ${escapeHtml(effectiveStatus)}">
            ${escapeHtml(formatStatusLabel(effectiveStatus))}
          </span>

          <h3>${escapeHtml(shopName)}</h3>
          <p>Submitted ${escapeHtml(formatDateTime(request.createdAt))}</p>
        </div>

        <strong>Rs ${formatMoney(getRequestAmount(request))}</strong>
      </div>
    </section>

    <section class="featured-admin-detail-grid">
      <div>
        <span>Seller</span>
        <strong>${escapeHtml(sellerName)}</strong>
      </div>

      <div>
        <span>Email</span>
        <strong>${escapeHtml(sellerEmail)}</strong>
      </div>

      <div>
        <span>Phone</span>
        <strong>${escapeHtml(sellerPhone)}</strong>
      </div>

      <div>
        <span>Location</span>
        <strong>${escapeHtml(location)}</strong>
      </div>

      <div>
        <span>Explore Shops</span>
        <strong>
          ${request.showInExploreShops === false ? "Disabled" : "Enabled"}
        </strong>
      </div>

      <div>
        <span>Expiry</span>
        <strong>
          ${expiryDate ? escapeHtml(formatDate(expiryDate)) : "Not active"}
        </strong>
      </div>
    </section>

    <section class="featured-admin-detail-section">
      <h3>Payment Proof</h3>
      ${proofMarkup}
    </section>

    ${
      request.rejectionReason
        ? `
          <section class="featured-admin-detail-section">
            <h3>Rejection Reason</h3>
            <p>${escapeHtml(request.rejectionReason)}</p>
          </section>
        `
        : ""
    }

    <section class="featured-admin-detail-actions">
      <a
        href="${escapeHtml(publicShopUrl)}"
        class="secondary-btn"
        target="_blank"
        rel="noopener noreferrer">
        View Public Shop
      </a>

      ${
        proofUrl
          ? `
            <a
              href="${escapeHtml(proofUrl)}"
              class="secondary-btn"
              target="_blank"
              rel="noopener noreferrer">
              Open Payment Proof
            </a>
          `
          : ""
      }
    </section>
  `;
}

function updateModalButtons(request) {
  const effectiveStatus = getEffectiveStatus(request);
  const isPending = effectiveStatus === "pending";

  if (approveFeaturedBtn) {
    approveFeaturedBtn.style.display = isPending ? "" : "none";
    approveFeaturedBtn.disabled = false;
    approveFeaturedBtn.textContent = "Approve";
  }

  if (rejectFeaturedBtn) {
    rejectFeaturedBtn.style.display = isPending ? "" : "none";
    rejectFeaturedBtn.disabled = false;
    rejectFeaturedBtn.textContent = "Reject";
  }
}

function createPaymentProofMarkup(proofUrl, proofType) {
  if (proofType === "pdf") {
    return `
      <div class="featured-proof-preview featured-proof-pdf">
        <iframe
          src="${escapeHtml(proofUrl)}"
          title="Featured Shop payment proof"
          loading="lazy">
        </iframe>
      </div>
    `;
  }

  return `
    <div class="featured-proof-preview">
      <img
        src="${escapeHtml(proofUrl)}"
        alt="Featured Shop payment proof"
        loading="lazy">
    </div>
  `;
}

/* =========================================================
   APPROVE / REJECT
   ========================================================= */

async function approveSelectedRequest() {
  if (!selectedRequest || isProcessing) return;

  const request = selectedRequest;
  const sellerId = getRequestSellerId(request);

  if (!sellerId) {
    alert("This request does not have a valid seller ID.");
    return;
  }

  const shopName =
    request.shopData?.shopName ||
    request.shopName ||
    "this shop";

  const confirmed = window.confirm(
    `Approve ${shopName} as a Featured Shop for ${FEATURED_DURATION_DAYS} days?`
  );

  if (!confirmed) return;

  setProcessingState(true, "Approving...");

  try {
    const now = new Date();
    const expiry = new Date(
      now.getTime() +
        FEATURED_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    const requestReference = doc(
      db,
      "featuredShopRequests",
      request.id
    );

    const shopReference = doc(db, "shops", sellerId);
    const shopSnapshot = await getDoc(shopReference);

    if (!shopSnapshot.exists()) {
      throw new Error(
        "The seller's shop document could not be found."
      );
    }

    await updateDoc(requestReference, {
      status: "approved",
      featuredStatus: "active",
      approvedAt: serverTimestamp(),
      approvedBy: currentAdmin?.uid || "",
      approvedByEmail: currentAdmin?.email || "",
      featuredSince: serverTimestamp(),
      featuredExpiry: Timestamp.fromDate(expiry),
      featuredPaymentVerified: true,
      rejectionReason: "",
      updatedAt: serverTimestamp()
    });

    await updateDoc(shopReference, {
      featuredShop: true,
      featuredStatus: "active",
      featuredPaymentVerified: true,
      featuredSince: serverTimestamp(),
      featuredExpiry: Timestamp.fromDate(expiry),
      showInExploreShops:
        request.showInExploreShops !== false,
      featuredLastApprovedRequestId: request.id,
      featuredLastApprovedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert(
      `${shopName} is now a Featured Shop until ${formatDate(expiry)}.`
    );

    closeRequestModalForce();
    await loadFeaturedShopRequests();
  } catch (error) {
    console.error("Could not approve Featured Shop request:", error);
    alert(
      error.message ||
        "The Featured Shop request could not be approved."
    );
  } finally {
    setProcessingState(false);
  }
}

async function rejectSelectedRequest() {
  if (!selectedRequest || isProcessing) return;

  const request = selectedRequest;
  const sellerId = getRequestSellerId(request);

  const rejectionReason = window.prompt(
    "Enter the reason for rejecting this Featured Shop request:"
  );

  if (rejectionReason === null) return;

  const cleanReason = rejectionReason.trim();

  if (cleanReason.length < 3) {
    alert("Please enter a clear rejection reason.");
    return;
  }

  setProcessingState(true, "Rejecting...");

  try {
    const requestReference = doc(
      db,
      "featuredShopRequests",
      request.id
    );

    await updateDoc(requestReference, {
      status: "rejected",
      featuredStatus: "rejected",
      rejectionReason: cleanReason,
      rejectedAt: serverTimestamp(),
      rejectedBy: currentAdmin?.uid || "",
      rejectedByEmail: currentAdmin?.email || "",
      updatedAt: serverTimestamp()
    });

    if (sellerId) {
      const shopReference = doc(db, "shops", sellerId);
      const shopSnapshot = await getDoc(shopReference);

      if (shopSnapshot.exists()) {
        await updateDoc(shopReference, {
          featuredShop: false,
          featuredStatus: "rejected",
          featuredPaymentVerified: false,
          showInExploreShops: false,
          featuredRejectionReason: cleanReason,
          featuredLastRejectedRequestId: request.id,
          featuredLastRejectedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    alert("The Featured Shop request has been rejected.");

    closeRequestModalForce();
    await loadFeaturedShopRequests();
  } catch (error) {
    console.error("Could not reject Featured Shop request:", error);
    alert(
      error.message ||
        "The Featured Shop request could not be rejected."
    );
  } finally {
    setProcessingState(false);
  }
}

function setProcessingState(processing, label = "") {
  isProcessing = processing;

  if (approveFeaturedBtn) {
    approveFeaturedBtn.disabled = processing;

    if (processing && label.startsWith("Approving")) {
      approveFeaturedBtn.textContent = label;
    } else if (!processing) {
      approveFeaturedBtn.textContent = "Approve";
    }
  }

  if (rejectFeaturedBtn) {
    rejectFeaturedBtn.disabled = processing;

    if (processing && label.startsWith("Rejecting")) {
      rejectFeaturedBtn.textContent = label;
    } else if (!processing) {
      rejectFeaturedBtn.textContent = "Reject";
    }
  }

  if (closeFeaturedModal) {
    closeFeaturedModal.disabled = processing;
  }
}

function closeRequestModalForce() {
  selectedRequest = null;

  if (typeof featuredRequestModal?.close === "function") {
    featuredRequestModal.close();
  } else {
    featuredRequestModal?.removeAttribute("open");
  }
}

/* =========================================================
   STATISTICS
   ========================================================= */

function updateStatistics() {
  const pending = allRequests.filter(
    (request) => getEffectiveStatus(request) === "pending"
  ).length;

  const active = allRequests.filter(
    (request) => getEffectiveStatus(request) === "approved"
  ).length;

  const expiringSoon = allRequests.filter((request) => {
    if (getEffectiveStatus(request) !== "approved") return false;

    const expiry =
      request.featuredExpiryDate ||
      getTimestampDate(request.featuredExpiry);

    if (!expiry) return false;

    const remaining =
      expiry.getTime() - Date.now();

    return (
      remaining >= 0 &&
      remaining <=
        EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
    );
  }).length;

  const approvedRevenue = allRequests
    .filter((request) => {
      const status = getEffectiveStatus(request);

      return status === "approved" || status === "expired";
    })
    .reduce(
      (sum, request) => sum + getRequestAmount(request),
      0
    );

  if (pendingFeaturedCount) {
    pendingFeaturedCount.textContent = String(pending);
  }

  if (activeFeaturedCount) {
    activeFeaturedCount.textContent = String(active);
  }

  if (expiringFeaturedCount) {
    expiringFeaturedCount.textContent = String(expiringSoon);
  }

  if (featuredRevenue) {
    featuredRevenue.textContent =
      `Rs ${formatMoney(approvedRevenue)}`;
  }
}

/* =========================================================
   EVENTS AND STATES
   ========================================================= */

function attachEvents() {
  featuredSearch?.addEventListener("input", applyFilters);
  featuredStatusFilter?.addEventListener("change", applyFilters);

  refreshFeaturedBtn?.addEventListener("click", async () => {
    if (!currentAdmin || isProcessing) return;
    await loadFeaturedShopRequests();
  });

  closeFeaturedModal?.addEventListener(
    "click",
    closeRequestModal
  );

  approveFeaturedBtn?.addEventListener(
    "click",
    approveSelectedRequest
  );

  rejectFeaturedBtn?.addEventListener(
    "click",
    rejectSelectedRequest
  );

  featuredRequestModal?.addEventListener("cancel", (event) => {
    if (isProcessing) {
      event.preventDefault();
      return;
    }

    selectedRequest = null;
  });

  featuredRequestModal?.addEventListener("click", (event) => {
    if (
      !isProcessing &&
      event.target === featuredRequestModal
    ) {
      closeRequestModal();
    }
  });
}

function showLoadingState() {
  if (featuredEmptyState) {
    featuredEmptyState.style.display = "none";
  }

  if (featuredRequestsContainer) {
    featuredRequestsContainer.style.display = "grid";
    featuredRequestsContainer.innerHTML = Array.from({
      length: 5
    })
      .map(
        () => `
          <article class="featured-request-card featured-request-skeleton">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line medium"></div>
          </article>
        `
      )
      .join("");
  }
}

function showPageError(message) {
  if (featuredEmptyState) {
    featuredEmptyState.style.display = "none";
  }

  if (featuredRequestsContainer) {
    featuredRequestsContainer.style.display = "block";
    featuredRequestsContainer.innerHTML = `
      <div class="empty-market-card">
        <h2>Featured Shop requests could not load</h2>
        <p>${escapeHtml(message)}</p>
        <button
          id="retryFeaturedRequestsBtn"
          type="button"
          class="btn">
          Try Again
        </button>
      </div>
    `;

    document
      .getElementById("retryFeaturedRequestsBtn")
      ?.addEventListener("click", loadFeaturedShopRequests);
  }
}

/* =========================================================
   HELPERS
   ========================================================= */

function getEffectiveStatus(request) {
  if (request.isExpired) return "expired";

  const status = getRequestStatus(request);

  if (status === "active") return "approved";
  return status || "pending";
}

function getRequestAmount(request) {
  const amount = Number(
    request.amount ||
      request.price ||
      request.planPrice ||
      request.subscriptionAmount ||
      FEATURED_PLAN_PRICE
  );

  return Number.isFinite(amount) && amount >= 0
    ? amount
    : FEATURED_PLAN_PRICE;
}

function getPaymentProofUrl(request) {
  return String(
    request.paymentProofUrl ||
      request.proofUrl ||
      request.paymentReceiptUrl ||
      request.receiptUrl ||
      ""
  ).trim();
}

function getPaymentProofType(request, url) {
  const explicitType = String(
    request.paymentProofType ||
      request.proofType ||
      request.paymentProofMimeType ||
      ""
  ).toLowerCase();

  if (
    explicitType.includes("pdf") ||
    String(url).toLowerCase().split("?")[0].endsWith(".pdf")
  ) {
    return "pdf";
  }

  return "image";
}

function getTimestampMilliseconds(value) {
  const date = getTimestampDate(value);
  return date ? date.getTime() : 0;
}

function getTimestampDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "number") {
    const milliseconds =
      value < 100000000000 ? value * 1000 : value;

    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function formatDateTime(value) {
  const date = getTimestampDate(value);

  if (!date) return "Unknown date";

  return new Intl.DateTimeFormat("en-MU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDate(value) {
  const date = getTimestampDate(value);

  if (!date) return "Unknown date";

  return new Intl.DateTimeFormat("en-MU", {
    dateStyle: "medium"
  }).format(date);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-MU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatStatusLabel(status) {
  const labels = {
    pending: "Pending Review",
    approved: "Active",
    rejected: "Rejected",
    expired: "Expired",
    cancelled: "Cancelled"
  };

  return labels[status] || capitalizeWords(status);
}

function capitalizeWords(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildPublicShopUrl(shopData, request) {
  const slug = normalizeShopSlug(
    shopData?.slug ||
      shopData?.shopSlug ||
      request.shopSlug ||
      ""
  );

  if (slug) {
    return `shop.html?shop=${encodeURIComponent(slug)}`;
  }

  const sellerId =
    shopData?.ownerId ||
    shopData?.sellerId ||
    getRequestSellerId(request) ||
    shopData?.id ||
    "";

  if (sellerId) {
    return `shop.html?id=${encodeURIComponent(sellerId)}`;
  }

  return "shops.html";
}

function normalizeShopSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[\'’]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
