/*
=========================================================
MauMarket Footer
Shared footer injected automatically on every page
=========================================================
*/

document.addEventListener("DOMContentLoaded", () => {
    // Prevent the footer from being inserted twice.
    if (document.querySelector(".mm-footer")) {
        return;
    }

    const currentYear = new Date().getFullYear();

    const footer = document.createElement("footer");

    footer.className = "mm-footer";
    footer.setAttribute("aria-label", "MauMarket footer");

    footer.innerHTML = `
        <div class="mm-footer-glow mm-footer-glow-one"></div>
        <div class="mm-footer-glow mm-footer-glow-two"></div>

        <div class="mm-footer-inner">

            <div class="mm-footer-top">

                <!-- =========================================
                     BRAND AND SOCIAL MEDIA
                ========================================== -->

                <section class="mm-footer-brand">

                    <a
                        href="index.html"
                        class="mm-footer-logo-link"
                        aria-label="Go to MauMarket home">

                        <img
                            src="images/maumarketlogo.png"
                            alt="MauMarket"
                            class="mm-footer-logo"
                            loading="lazy">

                    </a>

                    <p class="mm-footer-description">
                        Mauritius' trusted online marketplace connecting buyers
                        and merchants through secure payments, verified accounts
                        and MauMarket-managed delivery across Mauritius.
                    </p>

                    <div
                        class="mm-footer-social"
                        aria-label="MauMarket social media">

                        <!-- Facebook -->

                        <a
                            class="mm-social-link mm-social-facebook"
                            href="https://www.facebook.com/MaumarketMu"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Follow MauMarket on Facebook"
                            title="Facebook">

                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true">

                                <path
                                    d="M14.5 8.25V6.5c0-.87.58-1.08 1-1.08h2.55V1.16L14.54 1C10.64 1 9.75 3.92 9.75 5.8v2.45H7.5V13h2.25v10h4.75V13h3.15l.42-4.75H14.5Z">
                                </path>

                            </svg>

                            <span class="mm-social-tooltip">
                                Facebook
                            </span>

                        </a>

                        <!-- Instagram -->

                        <a
                            class="mm-social-link mm-social-instagram"
                            href="https://www.instagram.com/maumarket.mu?igsh=cmZic2RybjU5MGFj&utm_source=qr"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Follow MauMarket on Instagram"
                            title="Instagram">

                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true">

                                <rect
                                    x="3"
                                    y="3"
                                    width="18"
                                    height="18"
                                    rx="5">
                                </rect>

                                <circle
                                    cx="12"
                                    cy="12"
                                    r="4.25">
                                </circle>

                                <circle
                                    class="mm-instagram-dot"
                                    cx="17.4"
                                    cy="6.7"
                                    r="1">
                                </circle>

                            </svg>

                            <span class="mm-social-tooltip">
                                Instagram
                            </span>

                        </a>

                        <!-- TikTok -->

                        <a
                            class="mm-social-link mm-social-tiktok"
                            href="https://www.tiktok.com/@maumarket01?lang=en"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Follow MauMarket on TikTok"
                            title="TikTok">

                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true">

                                <path
                                    d="M15.4 2c.25 2.15 1.45 3.45 3.6 3.7v3.35a8.25 8.25 0 0 1-3.55-.82v6.25a6.5 6.5 0 1 1-5.6-6.44v3.45a3.17 3.17 0 1 0 2.15 3V2h3.4Z">
                                </path>

                            </svg>

                            <span class="mm-social-tooltip">
                                TikTok
                            </span>

                        </a>

                        <!-- WhatsApp -->

                        <a
                            class="mm-social-link mm-social-whatsapp"
                            href="https://wa.me/23057750662?text=Hello%20MauMarket%20Support%2C%20I%20need%20assistance."
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Contact MauMarket on WhatsApp"
                            title="WhatsApp">

                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true">

                                <path
                                    d="M20.5 11.73A8.46 8.46 0 0 1 7.99 19.2L3 20.5l1.33-4.82a8.47 8.47 0 1 1 16.17-3.95Zm-8.47-6.7a6.7 6.7 0 0 0-5.69 10.24l.2.31-.79 2.86 2.95-.77.3.18a6.7 6.7 0 1 0 3.03-12.82Zm-2.2 3.2c-.18-.4-.37-.4-.55-.4h-.47c-.16 0-.43.06-.66.3-.22.24-.86.84-.86 2.06 0 1.2.88 2.38 1 2.54.12.16 1.72 2.62 4.18 3.67.58.25 1.04.4 1.4.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28l-1.7-.79c-.23-.08-.4-.12-.57.12-.16.25-.64.79-.79.95-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.46-1.37-1.7-.14-.25-.01-.38.11-.5l.37-.43c.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43l-.75-1.83Z">
                                </path>

                            </svg>

                            <span class="mm-social-tooltip">
                                WhatsApp
                            </span>

                        </a>

                        <!-- Gmail -->

                        <a
                            class="mm-social-link mm-social-email"
                            href="mailto:maumarket33@gmail.com?subject=MauMarket%20Support%20Request"
                            aria-label="Email MauMarket"
                            title="Email">

                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true">

                                <path
                                    d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 7.1L20.1 7H3.9L12 12.1Zm0 2.35L3 8.8V17h18V8.8l-9 5.65Z">
                                </path>

                            </svg>

                            <span class="mm-social-tooltip">
                                Email
                            </span>

                        </a>

                    </div>

                </section>

                <!-- =========================================
                     MARKETPLACE
                ========================================== -->

                <nav
                    class="mm-footer-links"
                    aria-label="Marketplace links">

                    <h2>
                        Marketplace
                    </h2>

                    <a href="products.html">
                        Browse Products
                    </a>

                    <a href="register.html">
                        Become a Seller
                    </a>

                    <a href="cart.html">
                        Shopping Cart
                    </a>

                    <a href="dashboard.html">
                        My Account
                    </a>

                </nav>

                <!-- =========================================
                     SUPPORT
                ========================================== -->

                <nav
                    class="mm-footer-links"
                    aria-label="Support links">

                    <h2>
                        Support
                    </h2>

                    <a href="contact.html">
                        Contact Us
                    </a>

                    <a href="help.html">
                        Help Centre
                    </a>

                </nav>

                <!-- =========================================
                     LEGAL
                ========================================== -->

                <nav
                    class="mm-footer-links"
                    aria-label="Legal links">

                    <h2>
                        Legal
                    </h2>

                    <a href="terms.html">
                        Terms &amp; Conditions
                    </a>

                    <a href="buyer-policy.html">
                        Buyer Policy
                    </a>

                    <a href="seller-policy.html">
                        Seller Policy
                    </a>

                </nav>

                <!-- =========================================
                     CONTACT
                ========================================== -->

                <section class="mm-footer-contact">

                    <h2>
                        Contact
                    </h2>

                    <div class="mm-footer-contact-list">

                        <div class="mm-footer-contact-item">

                            <span class="mm-contact-icon">
                                📍
                            </span>

                            <div>
                                <small>
                                    Location
                                </small>

                                <strong>
                                    Mauritius
                                </strong>
                            </div>

                        </div>

                        <a
                            class="mm-footer-contact-item"
                            href="mailto:maumarket33@gmail.com">

                            <span class="mm-contact-icon">
                                ✉
                            </span>

                            <div>
                                <small>
                                    Email
                                </small>

                                <strong>
                                    maumarket33@gmail.com
                                </strong>
                            </div>

                        </a>

                        <a
                            class="mm-footer-contact-item"
                            href="https://wa.me/23057750662"
                            target="_blank"
                            rel="noopener noreferrer">

                            <span class="mm-contact-icon">
                                ☎
                            </span>

                            <div>
                                <small>
                                    WhatsApp
                                </small>

                                <strong>
                                    +230 5775 0662
                                </strong>
                            </div>

                        </a>

                    </div>

                    <div class="mm-payment-icons">

                        <span>
                            📱 Juice Payments
                        </span>

                    </div>

                </section>

            </div>

            <!-- =============================================
                 FOOTER BOTTOM
            ============================================== -->

            <div class="mm-footer-bottom">

                <p>
                    © ${currentYear}
                    <strong>MauMarket</strong>.
                    All Rights Reserved.
                </p>

                <div class="mm-footer-policy-links">

                    <a href="terms.html">
                        Terms
                    </a>

                    <a href="buyer-policy.html">
                        Buyer Policy
                    </a>

                    <a href="seller-policy.html">
                        Seller Policy
                    </a>

                </div>

            </div>

        </div>
    `;

    document.body.appendChild(footer);
});
