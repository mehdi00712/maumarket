<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Ad Banners | MauMarket</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="styles.css">
</head>
<body>

<header class="navbar">
  <h2>Ad Banners</h2>
  <nav>
    <a href="admin.html">Admin</a>
    <a href="products.html">Marketplace</a>
    <a href="dashboard.html">Dashboard</a>
  </nav>
</header>

<main class="container">

  <section class="form-card">
    <h1>Create Banner</h1>

    <input id="bannerTitle" placeholder="Banner title">
    <input id="shopId" placeholder="Seller UID / Shop ID">
    <input id="bannerSubtitle" placeholder="Subtitle optional">

    <label>Banner Image</label>
    <input id="bannerImage" type="file" accept="image/*">

    <button id="saveBannerBtn">Save Banner</button>
    <p id="bannerMessage"></p>
  </section>

  <section>
    <h1>Current Banners</h1>
    <div id="bannersList">Loading...</div>
  </section>

</main>

<script type="module" src="js/admin-banners.js"></script>
</body>
</html>
