/* ===================================================================
   Tarsonbd — interactions, animations & order submission
   ===================================================================

   >>> ORDER SETUP — paste ONE endpoint URL below <<<
   --------------------------------------------------------------
   Option A) EMAIL via Formspree (easiest):
     1. Go to https://formspree.io  → sign up (free).
     2. Create a new form, copy its endpoint, e.g.
        https://formspree.io/f/abcdwxyz
     3. Paste it in ORDER_ENDPOINT below and set ENDPOINT_TYPE = 'formspree'.
     → Every order arrives in your email inbox.

   Option B) GOOGLE SHEET via Apps Script (free, see SETUP-orders.md):
     1. Follow the steps in SETUP-orders.md to deploy the Web App.
     2. Paste the /exec URL below and set ENDPOINT_TYPE = 'sheet'.
     → Every order is added as a new row in your Google Sheet.

   Leave ORDER_ENDPOINT = '' to run in demo mode (just shows a toast).
   ================================================================== */
  const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyT8AFAIOZgGdLs0WEkMmQJVTJ3lJ_AXLoM4yEVYAEj6-W6SGTt1IYbpfCornzwsRB5_Q/exec';            // <-- paste your URL here
  const ENDPOINT_TYPE  = 'sheet';       // 'formspree' | 'sheet'

(function () {
  'use strict';

  /* ---- Bengali numeral helper ---- */
  const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  const toBn = (input) => String(input).replace(/\d/g, (d) => bnDigits[d]);
  const fmtBn = (n) => '৳' + toBn(n.toLocaleString('en-US'));

  /* ---- Cookie reader (used for Meta CAPI _fbp / _fbc) ---- */
  const getCookie = (name) => {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  };

  /* ---- Sticky header shadow on scroll ---- */
  const header = document.getElementById('header');
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- Mobile menu ---- */
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    nav.classList.toggle('open');
  });
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      hamburger.classList.remove('active');
      nav.classList.remove('open');
    })
  );

  /* ---- Scroll reveal ---- */
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.style.transitionDelay = (e.target.dataset.delay || 0) + 'ms';
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ---- Animated counters (Bengali digits) ---- */
  const cio = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseFloat(el.dataset.target);
        const decimals = parseInt(el.dataset.decimals || '0', 10);
        const start = performance.now();
        const step = (now) => {
          const p = Math.min((now - start) / 1600, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          const val = target * eased;
          const text = decimals
            ? val.toFixed(decimals)
            : Math.floor(val).toLocaleString('en-US');
          el.textContent = toBn(text) + (p === 1 && target >= 1000 ? '+' : '');
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        cio.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll('.count').forEach((el) => cio.observe(el));

  /* ---- Auto-swipe carousel(s) ---- */
  document.querySelectorAll('[data-carousel]').forEach((root) => {
    const track = root.querySelector('.carousel__track');
    const slides = [...root.querySelectorAll('.carousel__slide')];
    const dotsWrap = root.querySelector('.carousel__dots');
    if (!track || slides.length === 0) return;

    let idx = 0;
    const interval = parseInt(root.dataset.interval, 10) || 3500;

    // build dots
    if (dotsWrap) {
      slides.forEach((_, i) => {
        const b = document.createElement('button');
        b.className = 'carousel__dot' + (i === 0 ? ' is-active' : '');
        b.type = 'button';
        b.setAttribute('aria-label', 'ছবি ' + (i + 1));
        b.addEventListener('click', () => go(i, true));
        dotsWrap.appendChild(b);
      });
    }
    const dots = dotsWrap ? [...dotsWrap.children] : [];

    // squeeze transition: only the active slide is shown
    slides.forEach((s, i) => s.classList.toggle('is-active', i === 0));

    const go = (n, user) => {
      idx = (n + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
      if (user) restart();
    };

    let timer = setInterval(() => go(idx + 1), interval);
    const restart = () => {
      clearInterval(timer);
      timer = setInterval(() => go(idx + 1), interval);
    };

    // prev / next arrows
    const prevBtn = root.querySelector('.carousel__arrow--prev');
    const nextBtn = root.querySelector('.carousel__arrow--next');
    if (prevBtn) prevBtn.addEventListener('click', () => go(idx - 1, true));
    if (nextBtn) nextBtn.addEventListener('click', () => go(idx + 1, true));

    // pause while hovering
    root.addEventListener('mouseenter', () => clearInterval(timer));
    root.addEventListener('mouseleave', restart);
  });

  /* ---- Order: product + quantity + delivery + live total ---- */
  const productSel = document.getElementById('product');
  const qtyInput = document.getElementById('qty');
  const totalEl = document.getElementById('total');
  const subtotalEl = document.getElementById('subtotal');
  const deliveryCostEl = document.getElementById('delivery-cost');
  const deliveryRadios = document.querySelectorAll('input[name="delivery"]');

  const currentPrice = () => parseInt(productSel.selectedOptions[0].dataset.price, 10);
  const getDelivery = () => {
    const sel = document.querySelector('input[name="delivery"]:checked');
    return { charge: parseInt(sel.value, 10), area: sel.dataset.area };
  };
  const MIN_QTY = 1;
  const MAX_QTY = 10; // customers can order 1–10 units per order
  const minusBtn = document.getElementById('minus');
  const plusBtn = document.getElementById('plus');

  const updateTotal = () => {
    let q = parseInt(qtyInput.value, 10);
    if (isNaN(q) || q < MIN_QTY) q = MIN_QTY;
    if (q > MAX_QTY) q = MAX_QTY;
    qtyInput.value = q;

    // turn the buttons off at the limits
    minusBtn.disabled = q <= MIN_QTY;
    plusBtn.disabled = q >= MAX_QTY;

    const subtotal = currentPrice() * q;
    const delivery = getDelivery().charge;
    subtotalEl.textContent = fmtBn(subtotal);
    deliveryCostEl.textContent = delivery > 0 ? fmtBn(delivery) : 'ফ্রি 🎉';
    totalEl.textContent = fmtBn(subtotal + delivery);
  };

  productSel.addEventListener('change', updateTotal);
  deliveryRadios.forEach((r) => r.addEventListener('change', updateTotal));
  minusBtn.addEventListener('click', () => {
    qtyInput.value = parseInt(qtyInput.value, 10) - 1;
    updateTotal();
  });
  plusBtn.addEventListener('click', () => {
    qtyInput.value = parseInt(qtyInput.value, 10) + 1;
    updateTotal();
  });
  updateTotal();

  /* ---- "Order Now" buttons preselect product + scroll ---- */
  document.querySelectorAll('[data-product]').forEach((btn) => {
    btn.addEventListener('click', () => {
      for (const opt of productSel.options) {
        if (opt.value === btn.dataset.product) {
          productSel.value = opt.value;
          updateTotal();
          break;
        }
      }
    });
  });

  /* ---- Form validation + submit ---- */
  const form = document.getElementById('orderForm');
  const submitBtn = document.getElementById('submitBtn');
  const formMsg = document.getElementById('formMsg');
  const showMsg = (msg) => {
    formMsg.textContent = msg;
    formMsg.classList.add('show');
  };
  const clearMsg = () => {
    formMsg.textContent = '';
    formMsg.classList.remove('show');
  };

  const validators = {
    name: (v) => v.trim().length >= 2,
    phone: (v) => /^01\d{9}$/.test(v.trim().replace(/\s|-/g, '')),
    address: (v) => v.trim().length >= 6,
  };

  const sendOrder = async (data) => {
    if (!ORDER_ENDPOINT) {
      // demo mode
      console.log('Order (demo mode):', data);
      return true;
    }
    if (ENDPOINT_TYPE === 'sheet') {
      // Google Apps Script web app — no-cors write
      await fetch(ORDER_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
      });
      return true; // no-cors gives an opaque response, assume success
    }
    // Formspree (email)
    const res = await fetch(ORDER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  };

  /* ---- Anti-spam: cooldown + duplicate / rate-limit guard ---- */
  const ORDER_COOLDOWN_MS = 60 * 1000;   // lock the button 60s after a successful order
  const DUP_WINDOW_MS = 5 * 60 * 1000;   // block same phone+product within 5 minutes
  const RATE_MAX = 3;                     // at most 3 orders...
  const RATE_WINDOW_MS = 10 * 60 * 1000;  // ...per 10 minutes from one browser
  const ORDERS_KEY = 'tb_orders';

  const getRecentOrders = () => {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); } catch (_) { list = []; }
    const now = Date.now();
    return list.filter((o) => o && now - o.t < RATE_WINDOW_MS);
  };
  const recordOrder = (sig, recent) => {
    recent.push({ sig: sig, t: Date.now() });
    try { localStorage.setItem(ORDERS_KEY, JSON.stringify(recent)); } catch (_) {}
  };
  let cooldownTimer = null;
  const startCooldown = (baseText) => {
    let remaining = Math.round(ORDER_COOLDOWN_MS / 1000);
    submitBtn.disabled = true;
    const tick = () => {
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        submitBtn.disabled = false;
        submitBtn.textContent = baseText;
        return;
      }
      submitBtn.textContent = 'একটু পরে আবার (' + toBn(remaining) + ')';
      remaining--;
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // anti-spam honeypot: if the hidden field is filled, it's a bot — drop silently
    const hp = document.getElementById('hp_field');
    if (hp && hp.value.trim() !== '') return;

    let ok = true;
    Object.keys(validators).forEach((id) => {
      const input = document.getElementById(id);
      const valid = validators[id](input.value);
      input.closest('.field').classList.toggle('invalid', !valid);
      if (!valid) ok = false;
    });
    if (!ok) {
      showMsg('⚠️ অনুগ্রহ করে চিহ্নিত ঘরগুলো ঠিক করুন।');
      const firstInvalid = form.querySelector('.field.invalid input, .field.invalid textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }
    clearMsg();

    const orderId = makeOrderId();
    const subtotal = currentPrice() * parseInt(qtyInput.value, 10);
    const delivery = getDelivery();
    const data = {
      orderId: orderId,
      product: productSel.value,
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      address: document.getElementById('address').value.trim(),
      quantity: qtyInput.value,
      deliveryArea: delivery.area,
      deliveryCharge: delivery.charge,
      subtotal: subtotal,
      total: subtotal + delivery.charge,
      time: new Date().toLocaleString('en-GB'),
      // ---- for Meta CAPI (server-side) match quality ----
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc'),
      userAgent: navigator.userAgent,
      eventSourceUrl: window.location.href,
    };

    // block duplicate & too-frequent orders from the same browser
    const sig = data.phone + '|' + data.product;
    const recent = getRecentOrders();
    if (recent.some((o) => o.sig === sig && Date.now() - o.t < DUP_WINDOW_MS)) {
      showMsg('⚠️ আপনি একটু আগেই এই অর্ডারটি করেছেন। ডেলিভারির জন্য অপেক্ষা করুন, প্রয়োজনে কল করুন।');
      return;
    }
    if (recent.length >= RATE_MAX) {
      showMsg('⚠️ অল্প সময়ে অনেকগুলো অর্ডার হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন বা কল করুন।');
      return;
    }

    submitBtn.disabled = true;
    let success = false;
    const original = submitBtn.textContent;
    submitBtn.textContent = 'পাঠানো হচ্ছে…';
    try {
      success = await sendOrder(data);
      if (success) {
        // Meta Pixel — Purchase (eventID = orderId, so it dedups with the CAPI event)
        if (window.fbq) {
          fbq('track', 'Purchase', {
            value: data.total,
            currency: 'BDT',
            contents: [{ id: data.product, quantity: parseInt(data.quantity, 10) }],
            content_type: 'product',
          }, { eventID: data.orderId });
        }
        // remember this order to block duplicates / rapid re-orders
        recordOrder(sig, recent);
        showOrderModal(data);
        form.reset();
        qtyInput.value = 1;
        updateTotal();
      } else {
        showMsg('❌ দুঃখিত, কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন বা কল করুন।');
      }
    } catch (err) {
      console.error(err);
      showMsg('❌ নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন বা সরাসরি কল করুন।');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }

    // after a real success, lock the button for a short cooldown (stops instant re-orders)
    if (success) startCooldown(original);
  });

  form.querySelectorAll('input,textarea').forEach((el) =>
    el.addEventListener('input', () => {
      el.closest('.field').classList.remove('invalid');
      clearMsg();
    })
  );

  /* ---- Order ID generator (e.g. TB-482193) ---- */
  function makeOrderId() {
    const rand = Math.floor(100000 + Math.random() * 900000); // 6-digit code
    return 'TB-' + rand;
  }

  /* ---- Order confirmation modal ---- */
  const modal = document.getElementById('orderModal');
  const showOrderModal = (data) => {
    document.getElementById('m-orderid').textContent = data.orderId;
    document.getElementById('m-name').textContent = data.name;
    document.getElementById('m-phone').textContent = toBn(data.phone);
    document.getElementById('m-address').textContent = data.address;
    document.getElementById('m-product').textContent = data.product;
    document.getElementById('m-qty').textContent = toBn(data.quantity);
    document.getElementById('m-area').textContent =
      data.deliveryArea + (data.deliveryCharge > 0 ? ' (' + fmtBn(data.deliveryCharge) + ')' : ' (ফ্রি ডেলিভারি)');
    document.getElementById('m-breakdown').textContent =
      fmtBn(data.subtotal) + ' + ' + (data.deliveryCharge > 0 ? fmtBn(data.deliveryCharge) : 'ফ্রি ডেলিভারি');
    document.getElementById('m-total').textContent = fmtBn(data.total);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
  modal.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeModal)
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  /* ---- FAQ accordion: only one open at a time (fallback for older browsers) ---- */
  const faqItems = document.querySelectorAll('.faq__item');
  faqItems.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (item.open) {
        faqItems.forEach((other) => {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  /* ---- Footer year ---- */
  document.getElementById('year').textContent = toBn(new Date().getFullYear());
})();
