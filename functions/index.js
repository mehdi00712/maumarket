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
const COMMISSION_RATE = 0.10;
const MAX_PRODUCT_IMAGES = 3;
const MAX_PRODUCT_OPTIONS = 500;
const MAX_SAFE_PRICE = 100000000;
const MAX_SAFE_STOCK = 100000000;

/* =========================================================
   GENERIC VALIDATION HELPERS
   ========================================================= */

function productLimitFor(userData = {}) {
  const value = Number(userData.productLimit);

  if (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_LIMIT
  ) {
    return value;
  }

  // Existing sellers without productLimit keep the legacy 50-product limit.
  return LEGACY_SELLER_LIMIT;
}

function cleanText(value, name, min = 1, max = 500) {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be text.`
    );
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

function cleanOptionalText(value, name, max = 1000) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "";
  }

  return cleanText(value, name, 1, max);
}

function cleanNumber(
  value,
  name,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = false
) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be a valid number between ${min} and ${max}.`
    );
  }

  if (integer && !Number.isInteger(parsed)) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be a whole number.`
    );
  }

  return parsed;
}

function cleanBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return value === true;
}

function cleanUrl(value, name) {
  const cleaned = cleanText(value, name, 1, 2000);

  let parsedUrl;

  try {
    parsedUrl = new URL(cleaned);
  } catch {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be a valid URL.`
    );
  }

  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must use http or https.`
    );
  }

  return cleaned;
}

function cleanUrlArray(
  value,
  name,
  maxItems = MAX_PRODUCT_IMAGES
) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be an array.`
    );
  }

  if (value.length > maxItems) {
    throw new HttpsError(
      "invalid-argument",
      `${name} can contain no more than ${maxItems} items.`
    );
  }

  const uniqueUrls = [];

  value.forEach((entry, index) => {
    const url = cleanUrl(entry, `${name}[${index}]`);

    if (!uniqueUrls.includes(url)) {
      uniqueUrls.push(url);
    }
  });

  return uniqueUrls;
}

function cleanId(value, name, max = 150) {
  const cleaned = cleanText(value, name, 1, max);

  if (!/^[a-zA-Z0-9._:-]+$/.test(cleaned)) {
    throw new HttpsError(
      "invalid-argument",
      `${name} contains unsupported characters.`
    );
  }

  return cleaned;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculatePrices(rawSellerPrice) {
  const sellerPrice = roundMoney(
    cleanNumber(
      rawSellerPrice,
      "sellerPrice",
      0.01,
      MAX_SAFE_PRICE
    )
  );

  const commissionAmount = roundMoney(
    sellerPrice * COMMISSION_RATE
  );

  const buyerPrice = roundMoney(
    sellerPrice + commissionAmount
  );

  return {
    sellerPrice,
    commissionRate: COMMISSION_RATE,
    commissionPercent: 10,
    commissionAmount,
    buyerPrice,
    price: buyerPrice
  };
}

/* =========================================================
   PRODUCT OPTION / VARIANT VALIDATION
   ========================================================= */

function buildProductOption(
  rawOption,
  index,
  imageUrls
) {
  if (
    !rawOption ||
    typeof rawOption !== "object" ||
    Array.isArray(rawOption)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `options[${index}] must be an object.`
    );
  }

  const name = cleanText(
    rawOption.name || rawOption.label,
    `options[${index}].name`,
    1,
    150
  );

  const rawSellerPrice =
    rawOption.sellerPrice ??
    rawOption.basePrice ??
    rawOption.price;

  const prices = calculatePrices(rawSellerPrice);

  const stock = cleanNumber(
    rawOption.stock ?? 0,
    `options[${index}].stock`,
    0,
    MAX_SAFE_STOCK,
    true
  );

  const sku = cleanOptionalText(
    rawOption.sku || rawOption.productCode,
    `options[${index}].sku`,
    150
  );

  let imageIndex = null;

  if (
    rawOption.imageIndex !== undefined &&
    rawOption.imageIndex !== null &&
    rawOption.imageIndex !== ""
  ) {
    imageIndex = cleanNumber(
      rawOption.imageIndex,
      `options[${index}].imageIndex`,
      0,
      Math.max(0, imageUrls.length - 1),
      true
    );
  }

  const imageUrl =
    imageIndex !== null
      ? imageUrls[imageIndex] || imageUrls[0] || ""
      : imageUrls[0] || "";

  return {
    id:
      typeof rawOption.id === "string" &&
      rawOption.id.trim()
        ? cleanId(
            rawOption.id,
            `options[${index}].id`
          )
        : `option-${index + 1}`,

    name,
    label: name,

    sellerPrice: prices.sellerPrice,
    commissionRate: prices.commissionRate,
    commissionPercent: prices.commissionPercent,
    commissionAmount: prices.commissionAmount,
    buyerPrice: prices.buyerPrice,
    price: prices.price,

    stock,
    sku,
    productCode: sku,

    imageIndex,
    imageUrl,

    active: rawOption.active !== false
  };
}

function buildProductOptions(
  rawOptions,
  imageUrls
) {
  if (rawOptions === undefined || rawOptions === null) {
    return [];
  }

  if (!Array.isArray(rawOptions)) {
    throw new HttpsError(
      "invalid-argument",
      "options must be an array."
    );
  }

  if (rawOptions.length > MAX_PRODUCT_OPTIONS) {
    throw new HttpsError(
      "invalid-argument",
      `options can contain no more than ${MAX_PRODUCT_OPTIONS} items.`
    );
  }

  const usedNames = new Set();
  const usedSkus = new Set();

  return rawOptions.map((rawOption, index) => {
    const option = buildProductOption(
      rawOption,
      index,
      imageUrls
    );

    const normalizedName = option.name.toLowerCase();

    if (usedNames.has(normalizedName)) {
      throw new HttpsError(
        "invalid-argument",
        `The option "${option.name}" is duplicated.`
      );
    }

    usedNames.add(normalizedName);

    if (option.sku) {
      const normalizedSku = option.sku.toLowerCase();

      if (usedSkus.has(normalizedSku)) {
        throw new HttpsError(
          "invalid-argument",
          `The product code "${option.sku}" is duplicated.`
        );
      }

      usedSkus.add(normalizedSku);
    }

    return option;
  });
}

function getOptionsSummary(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return {
      minSellerPrice: 0,
      maxSellerPrice: 0,
      minBuyerPrice: 0,
      maxBuyerPrice: 0,
      totalStock: 0
    };
  }

  const sellerPrices = options.map(
    (option) => option.sellerPrice
  );

  const buyerPrices = options.map(
    (option) => option.buyerPrice
  );

  return {
    minSellerPrice: Math.min(...sellerPrices),
    maxSellerPrice: Math.max(...sellerPrices),
    minBuyerPrice: Math.min(...buyerPrices),
    maxBuyerPrice: Math.max(...buyerPrices),
    totalStock: options.reduce(
      (sum, option) => sum + option.stock,
      0
    )
  };
}

/* =========================================================
   SECURE PRODUCT BUILDER
   ========================================================= */

function buildProduct(raw, sellerId, shopData = {}) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Product data is missing or invalid."
    );
  }

  const type = cleanText(
    raw.type || "product",
    "type",
    1,
    30
  ).toLowerCase();

  if (!["product", "service"].includes(type)) {
    throw new HttpsError(
      "invalid-argument",
      "type must be product or service."
    );
  }

  const title = cleanText(
    raw.title,
    "title",
    2,
    150
  );

  const description = cleanOptionalText(
    raw.description,
    "description",
    5000
  );

  const category = cleanText(
    raw.category,
    "category",
    1,
    100
  );

  const serviceArea = cleanOptionalText(
    raw.serviceArea,
    "serviceArea",
    250
  );

  const suppliedImages = [
    ...(Array.isArray(raw.images) ? raw.images : []),
    ...(Array.isArray(raw.imageUrls) ? raw.imageUrls : []),
    ...(typeof raw.imageUrl === "string" &&
    raw.imageUrl.trim()
      ? [raw.imageUrl]
      : [])
  ];

  const imageUrls = cleanUrlArray(
    suppliedImages,
    "images",
    MAX_PRODUCT_IMAGES * 3
  ).slice(0, MAX_PRODUCT_IMAGES);

  const hasOptions =
    raw.hasOptions === true ||
    (Array.isArray(raw.options) &&
      raw.options.length > 0) ||
    (Array.isArray(raw.variants) &&
      raw.variants.length > 0);

  const rawOptions =
    Array.isArray(raw.options)
      ? raw.options
      : Array.isArray(raw.variants)
        ? raw.variants
        : [];

  const options = hasOptions
    ? buildProductOptions(rawOptions, imageUrls)
    : [];

  if (hasOptions && options.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "At least one product option is required."
    );
  }

  const optionType = hasOptions
    ? cleanText(
        raw.optionType || "Option",
        "optionType",
        1,
        100
      )
    : "";

  const optionSummary = getOptionsSummary(options);

  let prices;
  let stock;

  if (hasOptions) {
    prices = calculatePrices(
      optionSummary.minSellerPrice
    );

    stock = optionSummary.totalStock;
  } else {
    const rawSellerPrice =
      raw.sellerPrice ??
      (
        Number(raw.buyerPrice ?? raw.price) /
        (1 + COMMISSION_RATE)
      );

    prices = calculatePrices(rawSellerPrice);

    stock = cleanNumber(
      raw.stock ?? 0,
      "stock",
      0,
      MAX_SAFE_STOCK,
      true
    );
  }

  const shopName =
    typeof shopData.shopName === "string" &&
    shopData.shopName.trim()
      ? cleanText(
          shopData.shopName,
          "shopName",
          1,
          150
        )
      : "MauMarket Seller";

  const product = {
    sellerId,
    shopId: sellerId,
    shopName,
    publicMerchantLabel:
      shopData.featuredShop === true
        ? shopName
        : "Verified MauMarket Merchant",

    type,
    title,
    description,

    sellerPrice: prices.sellerPrice,
    commissionRate: prices.commissionRate,
    commissionPercent: prices.commissionPercent,
    commissionAmount: prices.commissionAmount,
    buyerPrice: prices.buyerPrice,
    price: prices.price,

    stock,
    category,
    serviceArea,

    imageUrl: imageUrls[0] || "",
    images: imageUrls,
    imageUrls,

    hasOptions,
    optionType,
    options,
    variants: options,
    variantCount: options.length,

    minSellerPrice: hasOptions
      ? optionSummary.minSellerPrice
      : prices.sellerPrice,

    maxSellerPrice: hasOptions
      ? optionSummary.maxSellerPrice
      : prices.sellerPrice,

    minBuyerPrice: hasOptions
      ? optionSummary.minBuyerPrice
      : prices.buyerPrice,

    maxBuyerPrice: hasOptions
      ? optionSummary.maxBuyerPrice
      : prices.buyerPrice,

    active: raw.active !== false,

    totalReviews: 0,
    ratingSum: 0,
    averageRating: 0,

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  return product;
}

/* =========================================================
   SECURE PRODUCT CREATION
   ========================================================= */

exports.createProductSecurely = onCall(
  {
    enforceAppCheck: false,
    consumeAppCheckToken: false
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in."
      );
    }

    const sellerId = request.auth.uid;
    const userRef = db.collection("users").doc(sellerId);
    const shopRef = db.collection("shops").doc(sellerId);

    const [
      firstUserSnapshot,
      firstShopSnapshot
    ] = await Promise.all([
      userRef.get(),
      shopRef.get()
    ]);

    if (!firstUserSnapshot.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Seller profile not found."
      );
    }

    const firstUserData =
      firstUserSnapshot.data() || {};

    if (firstUserData.blocked === true) {
      throw new HttpsError(
        "permission-denied",
        "This seller account is blocked."
      );
    }

    if (
      firstUserData.role !== "seller" ||
      firstUserData.approved !== true
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only approved sellers can add products."
      );
    }

    if (!firstShopSnapshot.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Save your business profile before adding products."
      );
    }

    const shopData =
      firstShopSnapshot.data() || {};

    if (shopData.active === false) {
      throw new HttpsError(
        "failed-precondition",
        "Your shop is not currently active."
      );
    }

    const rawProduct =
      request.data?.product || request.data;

    const safeProduct = buildProduct(
      rawProduct,
      sellerId,
      shopData
    );

    /*
     * Aggregate count is used to migrate old sellers and repair stale
     * productCount values before the transaction applies the new quota.
     */
    const countSnapshot = await db
      .collection("products")
      .where("sellerId", "==", sellerId)
      .count()
      .get();

    const actualCount =
      countSnapshot.data().count || 0;

    const result = await db.runTransaction(
      async (transaction) => {
        const latestUserSnapshot =
          await transaction.get(userRef);

        const latestShopSnapshot =
          await transaction.get(shopRef);

        if (!latestUserSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Seller profile not found."
          );
        }

        if (!latestShopSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Shop profile not found."
          );
        }

        const userData =
          latestUserSnapshot.data() || {};

        const latestShopData =
          latestShopSnapshot.data() || {};

        if (userData.blocked === true) {
          throw new HttpsError(
            "permission-denied",
            "This seller account is blocked."
          );
        }

        if (
          userData.role !== "seller" ||
          userData.approved !== true
        ) {
          throw new HttpsError(
            "permission-denied",
            "Only approved sellers can add products."
          );
        }

        if (latestShopData.active === false) {
          throw new HttpsError(
            "failed-precondition",
            "Your shop is not currently active."
          );
        }

        const productLimit =
          productLimitFor(userData);

        const storedCount =
          Number.isInteger(userData.productCount)
            ? Math.max(0, userData.productCount)
            : 0;

        /*
         * Math.max prevents a stale stored counter from allowing a seller
         * to exceed the real number of products already in Firestore.
         */
        const currentCount = Math.max(
          actualCount,
          storedCount
        );

        if (currentCount >= productLimit) {
          throw new HttpsError(
            "resource-exhausted",
            `You have reached your product limit of ${productLimit}.`,
            {
              productLimit,
              productCount: currentCount
            }
          );
        }

        const productRef =
          db.collection("products").doc();

        const newCount = currentCount + 1;

        transaction.create(
          productRef,
          {
            ...safeProduct,

            // Always refresh the authoritative shop label at creation time.
            shopName:
              latestShopData.shopName ||
              safeProduct.shopName,

            publicMerchantLabel:
              latestShopData.featuredShop === true
                ? latestShopData.shopName ||
                  safeProduct.shopName
                : "Verified MauMarket Merchant"
          }
        );

        transaction.set(
          userRef,
          {
            productLimit,
            productCount: newCount,
            productQuotaUpdatedAt:
              FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        return {
          productId: productRef.id,
          productLimit,
          productCount: newCount,
          remainingSlots: Math.max(
            0,
            productLimit - newCount
          )
        };
      }
    );

    logger.info(
      "Secure product created",
      {
        sellerId,
        ...result
      }
    );

    return {
      success: true,
      ...result
    };
  }
);

/* =========================================================
   PRODUCT COUNT DECREMENT AFTER DELETE
   ========================================================= */

exports.syncProductCountAfterDelete =
  onDocumentDeleted(
    {
      document: "products/{productId}",
      retry: true
    },
    async (event) => {
      const data = event.data?.data() || {};

      const sellerId =
        typeof data.sellerId === "string"
          ? data.sellerId
          : "";

      if (!sellerId) {
        logger.warn(
          "Deleted product had no sellerId",
          {
            productId: event.params.productId
          }
        );

        return;
      }

      const userRef =
        db.collection("users").doc(sellerId);

      await db.runTransaction(
        async (transaction) => {
          const userSnapshot =
            await transaction.get(userRef);

          if (!userSnapshot.exists) {
            return;
          }

          const userData =
            userSnapshot.data() || {};

          if (
            !Number.isInteger(
              userData.productCount
            )
          ) {
            /*
             * A legacy or unsynchronised account will be repaired during
             * the next secure create or by the admin recalculation callable.
             */
            return;
          }

          transaction.set(
            userRef,
            {
              productCount: Math.max(
                0,
                userData.productCount - 1
              ),
              productQuotaUpdatedAt:
                FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
      );

      logger.info(
        "Product count adjusted after deletion",
        {
          sellerId,
          productId: event.params.productId
        }
      );
    }
  );

/* =========================================================
   ADMIN PRODUCT COUNT RECALCULATION
   ========================================================= */

exports.recalculateSellerProductCount = onCall(
  {
    enforceAppCheck: false,
    consumeAppCheckToken: false
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in is required."
      );
    }

    const adminSnapshot = await db
      .collection("users")
      .doc(request.auth.uid)
      .get();

    const adminData =
      adminSnapshot.exists
        ? adminSnapshot.data() || {}
        : {};

    if (
      adminData.role !== "admin" ||
      adminData.blocked === true
    ) {
      throw new HttpsError(
        "permission-denied",
        "Administrator access is required."
      );
    }

    const sellerId = cleanId(
      request.data?.sellerId,
      "sellerId",
      128
    );

    const sellerRef =
      db.collection("users").doc(sellerId);

    const sellerSnapshot =
      await sellerRef.get();

    if (!sellerSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "The seller account was not found."
      );
    }

    const sellerData =
      sellerSnapshot.data() || {};

    if (sellerData.role !== "seller") {
      throw new HttpsError(
        "failed-precondition",
        "The selected account is not a seller."
      );
    }

    const countSnapshot = await db
      .collection("products")
      .where("sellerId", "==", sellerId)
      .count()
      .get();

    const productCount =
      countSnapshot.data().count || 0;

    const productLimit =
      productLimitFor(sellerData);

    await sellerRef.set(
      {
        productLimit,
        productCount,
        productQuotaUpdatedAt:
          FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    logger.info(
      "Seller product count recalculated",
      {
        adminId: request.auth.uid,
        sellerId,
        productLimit,
        productCount
      }
    );

    return {
      success: true,
      sellerId,
      productLimit,
      productCount,
      remainingSlots: Math.max(
        0,
        productLimit - productCount
      )
    };
  }
);
