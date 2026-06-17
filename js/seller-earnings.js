<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Seller Earnings | MauMarket</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="styles.css">
</head>
<body>

<header class="navbar">
  <h2>Seller Earnings</h2>
  <nav>
    <a href="seller.html">Seller Dashboard</a>
    <a href="seller-orders.html">Orders</a>
    <a href="products.html">Marketplace</a>
  </nav>
</header>

<main class="container">
  <h1>Your Earnings</h1>

  <section class="cards">
    <div class="card">
      <h3>Total Sales</h3>
      <h2>Rs <span id="sellerSales">0</span></h2>
    </div>

    <div class="card">
      <h3>Your Earnings</h3>
      <h2>Rs <span id="sellerEarnings">0</span></h2>
    </div>

    <div class="card">
      <h3>MauMarket Commission</h3>
      <h2>Rs <span id="sellerCommission">0</span></h2>
    </div>
  </section>

  <h2>Your Verified Orders</h2>
  <div id="sellerEarningsOrders">Loading...</div>
</main>

<script type="module" src="js/seller-earnings.js"></script>
</body>
</html>
