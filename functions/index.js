"use strict";

const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

initializeApp();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 20,
  timeoutSeconds: 60,
  memory: "256MiB"
});

const db = getFirestore();
const LEGACY_SELLER_LIMIT = 50;
const MAX_LIMIT = 10000;

function productLimitFor(userData) {
  const value = Number(userData.productLimit);

  if (Number.isInteger(value) && value >= 0 && value <= MAX_LIMIT) {
    return value;
  }

  // Existing sellers do not yet have productLimit, so they keep 50.
  return LEGACY_SELLER_LIMIT;
}

function cleanText(value, name, min = 1, max = 500) {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${name} must be text.`);
  }

  const cleaned = value.trim();

  if (cleaned.length < min || cleaned.length > max) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must contain between ${min} and ${max} characters.`
    );
  }

  return cleaned;
}

function cleanNumber(value, name, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be a valid number between ${min} and ${max}.`
    );
  }

  if (integer && !Number.isInteger(parsed)) {
    throw new HttpsError("invalid-argument", `${name} must be a whole number.`);
  }

  return parsed;
}

function cleanOptionalText(value, name, max = 1000) {
  if (value === undefined || value === null || value === "") return undefined;
  return cleanText(value, name, 1, max);
}

function cleanStringArray(value, name, maxItems = 12) {
  if (value === undefined || value === null) return undefined;

  if (!Array.isArray(value) || value.length > maxItems) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be an array with no more than ${maxItems} items.`
    );
  }

  return value.map((item, index) => cleanText(item, `${name}[${index}]`, 1, 2000));
}

function buildProduct(raw, sellerId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "Product data is missing or invalid.");
  }

  const type = cleanText(raw.type || "product", "type", 1, 30).toLowerCase();

  if (!['product', 'service'].includes(type)) {
    throw new HttpsError("invalid-argument", "type must be product or service.");
  }

  const product = {
    sellerId,
    type,
    title: cleanText(raw.title, "title", 2, 150),
    description: cleanText(raw.description, "description", 2, 5000),
    price: cleanNumber(raw.price, "price", 0, 100000000),
    stock: cleanNumber(raw.stock ?? 0, "stock", 0, 100000000, true),
    category: cleanText(raw.category, "category", 1, 100),
    active: raw.active !== false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    totalReviews: 0,
    ratingSum: 0,
    averageRating: 0
  };

  const textFields = {
    serviceArea: 250,
    imageUrl: 2000,
    unit: 100,
    material: 250,
    brand: 150,
    productCode: 150,
    sku: 150,
    delivery: 500,
    deliveryInfo: 1000,
    condition: 100
  };

  for (const [field, max] of Object.entries(textFields)) {
    const value = cleanOptionalText(raw[field], field, max);
    if (value !== undefined) product[field] = value;
  }

  const numericFields = {
    salePrice: [0, 100000000, false],
    minOrderQuantity: [1, 100000000, true],
    weight: [0, 100000000, false],
    width: [0, 100000000, false],
    height: [0, 100000000, false],
    length: [0, 100000000, false]
  };

  for (const [field, settings] of Object.entries(numericFields)) {
    if (raw[field] !== undefined && raw[field] !== null && raw[field] !== "") {
      product[field] = cleanNumber(raw[field], field, ...settings);
    }
  }

  const imageUrls = cleanStringArray(raw.imageUrls, "imageUrls", 12);
  if (imageUrls !== undefined) product.imageUrls = imageUrls;

  const images = cleanStringArray(raw.images, "images", 12);
  if (images !== undefined) product.images = images;

  const tags = cleanStringArray(raw.tags, "tags", 30);
  if (tags !== undefined) product.tags = tags;

  if (raw.variants !== undefined) {
    if (!Array.isArray(raw.variants) || raw.variants.length > 100) {
      throw new HttpsError(
        "invalid-argument",
        "variants must be an array with no more than 100 items."
      );
    }

    product.variants = raw.variants.map((variant, index) => {
      if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
        throw new HttpsError(
          "invalid-argument",
          `variants[${index}] must be an object.`
        );
      }
      return variant;
    });
  }

  return product;
}

exports.createProductSecurely = onCall(
  {
    enforceAppCheck: false,
    consumeAppCheckToken: false
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const sellerId = request.auth.uid;
    const userRef = db.collection("users").doc(sellerId);
    const firstUserSnapshot = await userRef.get();

    if (!firstUserSnapshot.exists) {
      throw new HttpsError("failed-precondition", "Seller profile not found.");
    }

    const firstUserData = firstUserSnapshot.data() || {};

    if (firstUserData.blocked === true) {
      throw new HttpsError("permission-denied", "This seller account is blocked.");
    }

    if (firstUserData.role !== "seller" || firstUserData.approved !== true) {
      throw new HttpsError(
        "permission-denied",
        "Only approved sellers can add products."
      );
    }

    const rawProduct = request.data?.product || request.data;
    const safeProduct = buildProduct(rawProduct, sellerId);

    // Used to migrate and reconcile sellers that already have products.
    const countSnapshot = await db
      .collection("products")
      .where("sellerId", "==", sellerId)
      .count()
      .get();

    const actualCount = countSnapshot.data().count || 0;

    const result = await db.runTransaction(async (transaction) => {
      const latestUserSnapshot = await transaction.get(userRef);

      if (!latestUserSnapshot.exists) {
        throw new HttpsError("failed-precondition", "Seller profile not found.");
      }

      const userData = latestUserSnapshot.data() || {};

      if (userData.blocked === true) {
        throw new HttpsError("permission-denied", "This seller account is blocked.");
      }

      if (userData.role !== "seller" || userData.approved !== true) {
        throw new HttpsError(
          "permission-denied",
          "Only approved sellers can add products."
        );
      }

      const productLimit = productLimitFor(userData);
      const storedCount = Number.isInteger(userData.productCount)
        ? Math.max(0, userData.productCount)
        : 0;

      // Protects existing products and simultaneous creation requests.
      const currentCount = Math.max(actualCount, storedCount);

      if (currentCount >= productLimit) {
        throw new HttpsError(
          "resource-exhausted",
          `You have reached your product limit of ${productLimit}.`,
          { productLimit, productCount: currentCount }
        );
      }

      const productRef = db.collection("products").doc();
      const newCount = currentCount + 1;

      transaction.create(productRef, safeProduct);
      transaction.set(
        userRef,
        {
          productLimit,
          productCount: newCount,
          productQuotaUpdatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      return {
        productId: productRef.id,
        productLimit,
        productCount: newCount,
        remainingSlots: Math.max(0, productLimit - newCount)
      };
    });

    logger.info("Secure product created", { sellerId, ...result });
    return { success: true, ...result };
  }
);

exports.syncProductCountAfterDelete = onDocumentDeleted(
  {
    document: "products/{productId}",
    retry: true
  },
  async (event) => {
    const data = event.data?.data() || {};
    const sellerId = typeof data.sellerId === "string" ? data.sellerId : "";

    if (!sellerId) {
      logger.warn("Deleted product had no sellerId", {
        productId: event.params.productId
      });
      return;
    }

    const userRef = db.collection("users").doc(sellerId);

    await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) return;

      const userData = userSnapshot.data() || {};

      if (!Number.isInteger(userData.productCount)) {
        // The next secure create will initialise it from the real count.
        return;
      }

      transaction.set(
        userRef,
        {
          productCount: Math.max(0, userData.productCount - 1),
          productQuotaUpdatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });

    logger.info("Product count adjusted after deletion", {
      sellerId,
      productId: event.params.productId
    });
  }
);

exports.recalculateSellerProductCount = onCall(
  {
    enforceAppCheck: false,
    consumeAppCheckToken: false
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in is required.");
    }

    const adminSnapshot = await db.collection("users").doc(request.auth.uid).get();
    const adminData = adminSnapshot.exists ? adminSnapshot.data() || {} : {};

    if (adminData.role !== "admin" || adminData.blocked === true) {
      throw new HttpsError(
        "permission-denied",
        "Administrator access is required."
      );
    }

    const sellerId = cleanText(request.data?.sellerId, "sellerId", 5, 128);
    const sellerRef = db.collection("users").doc(sellerId);
    const sellerSnapshot = await sellerRef.get();

    if (!sellerSnapshot.exists) {
      throw new HttpsError("not-found", "The seller account was not found.");
    }

    const countSnapshot = await db
      .collection("products")
      .where("sellerId", "==", sellerId)
      .count()
      .get();

    const productCount = countSnapshot.data().count || 0;
    const sellerData = sellerSnapshot.data() || {};
    const productLimit = productLimitFor(sellerData);

    await sellerRef.set(
      {
        productLimit,
        productCount,
        productQuotaUpdatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return {
      success: true,
      sellerId,
      productLimit,
      productCount,
      remainingSlots: Math.max(0, productLimit - productCount)
    };
  }
);
